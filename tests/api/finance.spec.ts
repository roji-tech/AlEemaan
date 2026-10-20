import { TEST_PAYSTACK_SECRET } from "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, Role } from "@prisma/client";
import { createUser, db, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { mockPaystack } from "@/lib/finance/mock-paystack";

let home: { id: string; name: string };
test.beforeAll(async () => {
  home = await seedInstance();
});

test.beforeEach(async () => {
  await db.payment.deleteMany();
  await db.invoiceDiscount.deleteMany();
  await db.invoice.deleteMany();
  await db.feeStructure.deleteMany();
  await db.studentEnrollment.deleteMany();
  await db.studentRecord.deleteMany();
  await db.classArm.deleteMany();
  await db.classGroup.deleteMany();
  await db.academicPeriod.deleteMany();
  await db.academicSession.deleteMany();
  await db.receiptCounter.deleteMany();
  await db.invoiceCounter.deleteMany();
  mockPaystack.reset();
});

const asRole = async (role: Role, branchId = home.id, superAdmin = false) => {
  const user = await createUser({ superAdmin });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};

test.describe("Finance API", () => {
  test("fee structures, batch invoices, manual payment, and discounts", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);

    // 1. Setup session and academic period
    const session = await db.academicSession.create({
      data: {
        branchId: home.id,
        label: "2026/2027",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-31"),
        status: "ACTIVE",
      },
    });

    const period = await db.academicPeriod.create({
      data: {
        branchId: home.id,
        sessionId: session.id,
        ordinal: 1,
        label: "1st Term",
        startDate: new Date("2026-09-01"),
        isCurrent: true,
      },
    });

    const group = await db.classGroup.create({
      data: { branchId: home.id, name: "JSS 1" },
    });

    const arm = await db.classArm.create({
      data: { branchId: home.id, classGroupId: group.id, name: "A" },
    });

    // 2. Setup enrolled student
    const student = await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName: "Amina",
        lastName: "Bello",
        admissionNo: "2026/0001",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2012-05-15"),
      },
    });

    await db.studentEnrollment.create({
      data: {
        branchId: home.id,
        studentId: student.id,
        sessionId: session.id,
        className: "JSS 1",
        classArmId: arm.id,
        status: "ACTIVE",
      },
    });

    // 3. Unauthorized checks
    const unauth = await api(`/api/v1/finance/fee-structures?branchId=${home.id}`);
    expect(unauth.status).toBe(401);

    // 4. Create Fee Structures (Tuition + Sports Levy)
    const resTuition = await api("/api/v1/finance/fee-structures", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        branchId: home.id,
        periodId: period.id,
        classGroupId: group.id,
        name: "Tuition",
        amount: 50000,
      },
    });
    expect(resTuition.status).toBe(201);
    const tuitionData = resTuition.json.data;
    expect(tuitionData.name).toBe("Tuition");

    const resLevy = await api("/api/v1/finance/fee-structures", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        branchId: home.id,
        periodId: period.id,
        classGroupId: null, // Universal fee
        name: "Development Levy",
        amount: 10000,
      },
    });
    expect(resLevy.status).toBe(201);

    // Teacher cannot create fee structure (403)
    const teacherCreate = await api("/api/v1/finance/fee-structures", {
      method: "POST",
      cookie: teacher.cookie,
      body: {
        branchId: home.id,
        periodId: period.id,
        name: "Forbidden Fee",
        amount: 5000,
      },
    });
    expect(teacherCreate.status).toBe(403);

    // 5. Batch generate invoices
    const genRes = await api("/api/v1/finance/invoices", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        branchId: home.id,
        periodId: period.id,
      },
    });
    expect(genRes.status).toBe(201);
    const genData = genRes.json.data;
    expect(genData.created).toBe(1);
    expect(genData.skipped).toBe(0);

    // Idempotent re-run skips existing
    const genRes2 = await api("/api/v1/finance/invoices", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        branchId: home.id,
        periodId: period.id,
      },
    });
    expect(genRes2.status).toBe(201);
    expect(genRes2.json.data.created).toBe(0);
    expect(genRes2.json.data.skipped).toBe(1);

    // 6. List and inspect invoices
    const listRes = await api(`/api/v1/finance/invoices?branchId=${home.id}&periodId=${period.id}`, {
      cookie: admin.cookie,
    });
    expect(listRes.status).toBe(200);
    const invoiceList = listRes.json.data.invoices;
    expect(invoiceList.length).toBe(1);
    const invoice = invoiceList[0];
    expect(Number(invoice.totalAmount)).toBe(60000); // 50000 tuition + 10000 levy
    expect(invoice.status).toBe("UNPAID");

    // 7. Apply a discount (e.g. ₦10,000 scholarship)
    const discountRes = await api(`/api/v1/finance/invoices/${invoice.id}/discount?branchId=${home.id}`, {
      method: "POST",
      cookie: admin.cookie,
      body: {
        amount: 10000,
        reason: "Academic Excellence Scholarship",
      },
    });
    expect(discountRes.status).toBe(201);

    // Verify invoice total adjusted to net ₦50,000
    const detailRes = await api(`/api/v1/finance/invoices/${invoice.id}?branchId=${home.id}`, {
      cookie: admin.cookie,
    });
    expect(detailRes.status).toBe(200);
    const updatedInvoice = detailRes.json.data;
    expect(Number(updatedInvoice.totalAmount)).toBe(50000);

    // 8. Record partial manual payment (₦20,000 via POS)
    const payRes1 = await api(`/api/v1/finance/invoices/${invoice.id}/record-payment?branchId=${home.id}`, {
      method: "POST",
      cookie: admin.cookie,
      body: {
        amount: 20000,
        channel: "pos",
        notes: "Front desk POS payment",
      },
    });
    expect(payRes1.status).toBe(201);
    const payment1 = payRes1.json.data;
    expect(payment1.receiptNo).toContain("RCP-");

    // Invoice status becomes PARTIALLY_PAID
    const detailRes2 = await api(`/api/v1/finance/invoices/${invoice.id}?branchId=${home.id}`, {
      cookie: admin.cookie,
    });
    const invAfterPart = detailRes2.json.data;
    expect(Number(invAfterPart.amountPaid)).toBe(20000);
    expect(invAfterPart.status).toBe("PARTIALLY_PAID");

    // 9. Record remaining manual payment (₦30,000 cash)
    const payRes2 = await api(`/api/v1/finance/invoices/${invoice.id}/record-payment?branchId=${home.id}`, {
      method: "POST",
      cookie: admin.cookie,
      body: {
        amount: 30000,
        channel: "cash",
      },
    });
    expect(payRes2.status).toBe(201);

    // Invoice status becomes PAID
    const detailRes3 = await api(`/api/v1/finance/invoices/${invoice.id}?branchId=${home.id}`, {
      cookie: admin.cookie,
    });
    const invAfterFull = detailRes3.json.data;
    expect(Number(invAfterFull.amountPaid)).toBe(50000);
    expect(invAfterFull.status).toBe("PAID");
  });

  test("Paystack online checkout initialization and webhook fulfilment", async () => {
    const admin = await asRole(Role.ADMIN);

    const session = await db.academicSession.create({
      data: {
        branchId: home.id,
        label: "2026/2027",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-31"),
        status: "ACTIVE",
      },
    });

    const period = await db.academicPeriod.create({
      data: {
        branchId: home.id,
        sessionId: session.id,
        ordinal: 1,
        label: "1st Term",
        startDate: new Date("2026-09-01"),
        isCurrent: true,
      },
    });

    const student = await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName: "Bilal",
        lastName: "Yusuf",
        admissionNo: "2026/0002",
        gender: Gender.MALE,
        dateOfBirth: new Date("2013-02-10"),
      },
    });

    const invoice = await db.invoice.create({
      data: {
        branchId: home.id,
        studentId: student.id,
        periodId: period.id,
        invoiceNo: "INV-TEST-2026-0001",
        totalAmount: 45000,
        amountPaid: 0,
        status: "UNPAID",
      },
    });

    // 1. Initialize Paystack gateway payment
    const initRes = await api(`/api/v1/finance/invoices/${invoice.id}/pay?branchId=${home.id}`, {
      method: "POST",
      cookie: admin.cookie,
      body: {
        email: "parent@example.com",
        amount: 45000,
      },
    });
    expect(initRes.status).toBe(200);
    const initData = initRes.json.data;
    expect(initData.reference).toContain("alm_pay_");
    expect(initData.authorizationUrl).toContain(initData.reference);

    // 2. Simulate webhook charge.success delivery
    const secretKey = TEST_PAYSTACK_SECRET; // the harness key the server under test verifies with (never the public mock string)
    const webhook = mockPaystack.generateWebhookPayload(initData.reference, secretKey, 4500000, "parent@example.com");

    const webhookRes = await api("/api/v1/webhooks/paystack", {
      method: "POST",
      headers: {
        "x-paystack-signature": webhook.signature,
        "content-type": "application/json",
      },
      rawBody: webhook.rawBody,
    });
    expect(webhookRes.status).toBe(200);

    // 3. Verify invoice is now PAID with receipt allocated
    const invoiceCheck = await db.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: { payments: true },
    });
    expect(invoiceCheck.status).toBe("PAID");
    expect(Number(invoiceCheck.amountPaid)).toBe(45000);
    expect(invoiceCheck.payments.length).toBe(1);
    expect(invoiceCheck.payments[0].status).toBe("SUCCESS");
    expect(invoiceCheck.payments[0].verifiedServerSide).toBe(true);
    expect(invoiceCheck.payments[0].receiptNo).toContain("RCP-");
  });
});
