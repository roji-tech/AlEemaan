import type { LandingCopy, LandingLabels } from "@/components/landing/LandingPage";

// The words of the landing page in Arabic (task 0050), the same page as `brand.landing` (src/lib/brand.ts) with the same shape and the same claims, and no more.
//
// *** Translated by an AI, not by a native speaker. A reader who knows Arabic must go through every line before this page is made public: the wording, the register (Modern Standard
// *** Arabic, for a school's parents), the names of the branches, the school's name in Arabic (`nameAr`), and whether "المنصة" or "البوابة" is the word the school uses for its portal.

/// The school's name as the header and the footer say it (the product's logo text is Latin: "AlEemaan").
export const nameAr = "الإيمان";

export const landingAr: LandingCopy & { title: string; description: string } = {
  title: "مدرسة الإيمان، إبادان",
  description: "مدرسة الإيمان في إبادان بنيجيريا لها أربعة فروع: ثانوي وابتدائي، بالإنجليزية وبالعربية.",
  eyebrow: "إبادان، نيجيريا",
  headline: "التعليم الثانوي والابتدائي، بالإنجليزية وبالعربية.",
  lead: "لمدرسة الإيمان أربعة فروع. يسجّل أولياء الأمور والتلاميذ الدخول هنا لمتابعة النتائج والرسوم والحضور، ويسجّل العاملون الدخول لأداء عملهم.",
  coversHeading: "فروعنا",
  covers: [
    { title: "الثانوية (الإنجليزية)", text: "الفرع الثانوي، بالإنجليزية." },
    { title: "الابتدائية (الإنجليزية)", text: "الفرع الابتدائي، بالإنجليزية." },
    { title: "الثانوية (العربية)", text: "الفرع الثانوي، بالعربية." },
    { title: "الابتدائية (العربية)", text: "الفرع الابتدائي، بالعربية." },
  ],
  peopleHeading: "لأولياء الأمور والعاملين",
  people: [
    { who: "أولياء الأمور", text: "اطّلعوا في البوابة على نتائج أبنائكم، وتابعوا رسومهم ومدفوعاتهم وحضورهم." },
    { who: "التلاميذ", text: "اقرؤوا في البوابة النتائج المنشورة والمواد التعليمية." },
    { who: "المعلمون", text: "سجّلوا الحضور وأدخلوا الدرجات لفصولكم." },
    { who: "مديرو الفروع ورئيس المدرسة", text: "إدارة فرع، أو الاطلاع على كل الفروع من حساب واحد." },
  ],
  closingHeading: "هل أنت من أسرة مدرسة الإيمان؟",
  closingText: "يسجّل العاملون الدخول لفتح لوحتهم. أما أولياء الأمور والتلاميذ فيستخدمون البوابة.",
  links: [{ label: "بوابة أولياء الأمور والتلاميذ", href: "/portal" }],
};

export const labelsAr: LandingLabels = {
  signIn: "تسجيل الدخول",
  footerNav: "تذييل الصفحة",
  rights: (year, name) => `© ${year} ${name}. جميع الحقوق محفوظة.`,
  theme: { toLight: "التبديل إلى المظهر الفاتح", toDark: "التبديل إلى المظهر الداكن" },
};
