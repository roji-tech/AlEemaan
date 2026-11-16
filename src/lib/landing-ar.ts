import type { LandingCopy, LandingLabels } from "@/components/landing/LandingPage";
import type { SchoolAbout } from "@/components/landing/SchoolInfo";

// The words of the landing page in Arabic (task 0050), the same page as `brand.landing` (src/lib/brand.ts) with the same shape and the same claims, and no more.
//
// *** Translated by an AI, not by a native speaker. A reader who knows Arabic must go through every line before this page is made public (the three programs, the four values and the
// *** admissions line of task 0070 included): the wording, the register (Modern Standard
// *** Arabic, for a school's parents), the names of the branches, the school's name in Arabic (`nameAr`), and whether "المنصة" or "البوابة" is the word the school uses for its portal.

/// The school's name as the header and the footer say it (the product's logo text is Latin: "AlEemaan").
export const nameAr = "الإيمان";

export const landingAr: LandingCopy & { title: string; description: string; about: SchoolAbout } = {
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
  about: {
    programsHeading: "برامجنا",
    programs: [
      {
        title: "العلوم",
        text: "الفيزياء والكيمياء والأحياء والرياضيات وعلوم الحاسوب، مع عمل مخبري عملي وإعداد لامتحاني الوايك والنيكو.",
      },
      {
        title: "العلوم مع الدراسات العربية والإسلامية",
        text: "تعليم علمي ودراسات إسلامية تُدرَّسان معًا، ليكون التلاميذ مستعدين للمجالين.",
      },
      {
        title: "الدراسات العربية والإسلامية",
        text: "القرآن الكريم والحديث الشريف واللغة العربية والفقه الإسلامي، يدرّسها علماء مختصون، مع حفظ القرآن الكريم.",
      },
    ],
    valuesHeading: "ما نؤمن به",
    values: [
      { title: "التفوق الدراسي", text: "منهج متوازن في العلوم وفي اللغة العربية، يُدرَّس بعناية." },
      { title: "الشخصية الإسلامية", text: "دراسة القرآن والحديث، وبيئة مدرسية قائمة على الاحترام والصدق والرحمة." },
      { title: "الانضباط والقيم", text: "ضبط النفس والالتزام بالمواعيد وقيم أخلاقية راسخة." },
      {
        title: "تنمية الطفل بكامله",
        text: "الرياضة والمناظرات وخدمة المجتمع والفنون الإبداعية تساعد كل طفل على اكتشاف قدراته.",
      },
    ],
    contactHeading: "القبول والتواصل",
    contactText: "للسؤال عن مقعد لابنكم أو ابنتكم، تواصلوا مع مكتب المدرسة.",
    contactLabels: { phone: "الهاتف", email: "البريد الإلكتروني", address: "العنوان", website: "الموقع الإلكتروني" },
  },
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
