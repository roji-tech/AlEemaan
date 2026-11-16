import type { Metadata } from "next";
import { AnthemPlayer } from "@/components/site/AnthemPlayer";
import { SiteIcon, type SiteIconName } from "@/components/site/icons";
import { PageHeader, WRAP } from "@/components/site/parts";

// The school anthem (task 0080), the old static page as React and Tailwind: the Arabic text, its English translation, the recordings and the school's values. The words are the old page's.
export const metadata: Metadata = {
  title: { absolute: "School Anthem | Aleeman School" },
  description: "The official anthem of Aleeman School of Science & Arabic Study, in Arabic with an English translation.",
};

const ARABIC: [string, string][] = [
  ["دار الإيمان دار الإيمان", "دار التقوى والإيمان"],
  ["دار العلم بالأركان", "دار الرشد والعرفان"],
  ["فيها علم بالإتقان", "فيها حفظ للقرآن"],
  ["فيها فقه بالإيقان", "فيها حظ للغلمان"],
  ["نِعْمَ يا صاح دار الإيمان", "طابت دارًا للشجعان"],
  ["حقًا حقًا صدقًا صدقًا", "فيها فقه بالإيقان"],
  ["رب جهول في الظلمات", "رب ملول أو كسلان"],
  ["صار إمامًا في العرفان", "في ذي الدار بالرجحان"],
  ["احفظ ربي ذا العرفان", "شيخي دومًا في البرهان"],
  ["ذلك شيخي سليمان", "أموجيًا ذو الإتقان"],
  ["أسس حقًا دار الإيمان", "طلبًا نيلاً للرضوان"],
  ["حقق ربي أمانيه", "يا ذا الفضل والغفران"],
  ["زدنا علمًا بالخيرات", "زدنا فهمًا للفرقان"],
  ["صلِّ وسلم ربي دومًا", "للمختار والأعوان"],
];

const ENGLISH: string[][] = [
  [
    "The Abode of Faith, the Abode of Faith",
    "The abode of knowledge of the pillars",
    "Within it is knowledge with mastery",
    "Within it is jurisprudence with certainty",
    "How excellent, my companion, is the Abode of Faith",
    "Truly, truly — honest and sincere",
    "One once ignorant in the depths of darkness",
    "Became a leader in true understanding",
    "My Lord, preserve the possessor of gnosis",
    "That is my shaykh, Sulaymān",
    "He truly founded the Abode of Faith",
    "My Lord fulfilled his hopes",
    "Increase us in knowledge through good deeds",
    "Send prayers and peace, my Lord, always",
  ],
  [
    "The Abode of God-consciousness and Faith",
    "The abode of guidance and inner knowledge",
    "Within it is the memorization of the Qur'an",
    "Within it is a noble share for the youth",
    "A blessed home for the brave",
    "Within it is jurisprudence with certainty",
    "Whether weary or inclined to laziness",
    "In this abode there is success and advantage",
    "My shaykh is ever firm in proof",
    "A masterful guide of precision",
    "Seeking attainment of divine pleasure",
    "O Possessor of bounty and forgiveness",
    "Increase us in understanding of the Criterion (Qur'an)",
    "For the Chosen One and his companions",
  ],
];

const VALUES: { icon: SiteIconName; title: string; text: string }[] = [
  { icon: "heart", title: "Faith", text: "Nurturing strong Islamic faith and character" },
  { icon: "bookOpen", title: "Knowledge", text: "Pursuing excellence in science and Arabic studies" },
  { icon: "mosque", title: "Piety", text: "Cultivating Allah-consciousness in all actions" },
  { icon: "users", title: "Community", text: "Building a supportive learning community" },
];

const ABOUT = [
  {
    title: "About the Anthem",
    text: "This anthem beautifully encapsulates the essence of Aleeman School, celebrating the journey from ignorance to enlightenment through faith, knowledge, and dedication to Islamic learning.",
  },
  {
    title: "Educational Philosophy",
    text: "The anthem reflects our commitment to holistic education that combines Quranic memorization, Islamic jurisprudence, Arabic language mastery, and scientific knowledge.",
  },
  {
    title: "Spiritual Foundation",
    text: "Every verse emphasizes the spiritual transformation that occurs within these walls, where students develop both intellectual and moral excellence.",
  },
];

export default function AnthemPage() {
  return (
    <>
      <PageHeader title="School Anthem" text="The Official Anthem of Aleeman School of Science & Arabic Study" />

      <section className="bg-white py-20">
        <div className={`${WRAP} max-w-4xl`}>
          <h2 lang="ar" dir="rtl" className="mb-2 text-center text-5xl font-bold text-[#006400]">
            دار الإيمان
          </h2>
          <p lang="ar" dir="rtl" className="mb-8 text-center text-xl text-[#2a7f4f]">
            النشيد الوطني للمدرسة
          </p>
          <div
            lang="ar"
            dir="rtl"
            className="space-y-4 rounded-[20px] border-2 border-[#90ee90] bg-[#f8f9fa] p-8 text-center text-2xl leading-loose font-serif text-[#222]"
          >
            {ARABIC.map(([a, b]) => (
              <p key={a}>
                {a}
                <br />
                {b}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f5f5f5] py-20">
        <div className={`${WRAP} max-w-4xl`}>
          <h2 className="mb-8 flex items-center justify-center gap-3 text-3xl font-bold text-[#006400]">
            <SiteIcon name="globe" className="size-7" />
            English Translation
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            {ENGLISH.map((stanza) => (
              <div key={stanza[0]} className="rounded-[15px] bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
                {stanza.map((line) => (
                  <p key={line} className="py-0.5 text-[#444]">
                    {line}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className={WRAP}>
          <AnthemPlayer />
        </div>
      </section>

      <section className="bg-[#f5f5f5] py-20">
        <div className={WRAP}>
          <h2 className="mb-10 text-center text-3xl font-bold text-[#006400]">Core Values of Aleeman School</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map((v) => (
              <article key={v.title} className="rounded-[15px] bg-white p-8 text-center shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
                <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-[#2a7f4f]/10 text-[#2a7f4f]">
                  <SiteIcon name={v.icon} className="size-7" />
                </div>
                <h3 className="mb-1 text-lg font-bold">{v.title}</h3>
                <p className="text-sm text-[#666]">{v.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className={`${WRAP} grid gap-6 md:grid-cols-3`}>
          {ABOUT.map((a) => (
            <article key={a.title} className="rounded-[15px] bg-[#f5f5f5] p-8">
              <h3 className="mb-2 text-lg font-bold text-[#006400]">{a.title}</h3>
              <p className="text-[#555]">{a.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-[linear-gradient(135deg,#006400,#2a7f4f)] py-12 text-center text-white">
        <p lang="ar" dir="rtl" className="mb-2 text-2xl font-serif">
          معهد العلم والإيمان
        </p>
        <p className="opacity-90">&ldquo;Second To None- The Guiding Principles of Aleeman School&rdquo;</p>
      </section>
    </>
  );
}
