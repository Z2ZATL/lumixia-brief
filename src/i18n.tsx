import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

const messages = {
  en: {
    projects: 'Projects',
    settings: 'Connections',
    newProject: 'New project',
    signIn: 'Start a clear brief',
    eyebrow: 'Human-approved alignment for AI work',
    hero: 'Turn a vague idea into a brief everyone can act on.',
    heroBody:
      'Lumixia Brief interviews before it generates—separating known facts, assumptions, contradictions, and decisions that still belong to you.',
    how: 'Clarity before generation',
    step1: 'Start with the rough idea',
    step2: 'Answer one focused question at a time',
    step3: 'Review and approve before Notion sync',
    privacy: 'Private by design',
    privacyBody:
      'Google sign-in, mandatory TOTP, owner-scoped data, and no prompt or brief content in monitoring logs.',
    allProjects: 'Your briefs',
    empty: 'No projects yet. Start with the idea that is still hard to explain.',
    initialIdea: 'Rough idea',
    create: 'Create and begin interview',
    title: 'Project name',
    cancel: 'Cancel',
    interview: 'Interview',
    review: 'Review brief',
    answer: 'Your answer',
    continue: 'Save answer & continue',
    thinking: 'Checking alignment…',
    generate: 'Generate structured brief',
    confidence: 'Alignment confidence',
    known: 'Known',
    assumed: 'Assumed',
    partial: 'Partial',
    missing: 'Missing',
    clear: 'Clear',
    facts: 'Established facts',
    assumptions: 'Assumptions surfaced',
    contradictions: 'Contradictions',
    save: 'Save changes',
    approve: 'Approve snapshot',
    reject: 'Reject & revise',
    sync: 'Sync to Notion',
    notionParent: 'Notion parent page ID',
    setParent: 'Set parent',
    versions: 'Version history',
    alignment: 'Alignment Improvement',
    from: 'Initial prompt',
    to: 'Final interview',
    decisions: 'human decisions remaining',
    retry: 'Retry saved answer',
    status: 'Status',
    secureSetup: 'Complete two-step security',
    secureBody:
      'Lumixia Brief requires TOTP before any project data is available. Open Security below, add an authenticator app, and save your backup codes.',
  },
  th: {
    projects: 'โปรเจกต์',
    settings: 'การเชื่อมต่อ',
    newProject: 'โปรเจกต์ใหม่',
    signIn: 'เริ่มสร้างบรีฟที่ชัดเจน',
    eyebrow: 'จัดแนวความเข้าใจก่อนให้ AI ลงมือ',
    hero: 'เปลี่ยนไอเดียที่ยังคลุมเครือ ให้เป็นบรีฟที่ทุกคนลงมือทำได้',
    heroBody:
      'Lumixia Brief สัมภาษณ์ก่อนสร้างงาน แยกข้อเท็จจริง สมมติฐาน ความขัดแย้ง และสิ่งที่ยังต้องให้คุณตัดสินใจ',
    how: 'ทำให้ชัดก่อนสร้าง',
    step1: 'เริ่มจากไอเดียคร่าว ๆ',
    step2: 'ตอบคำถามสำคัญทีละข้อ',
    step3: 'ตรวจและอนุมัติก่อน sync เข้า Notion',
    privacy: 'เป็นส่วนตัวตั้งแต่การออกแบบ',
    privacyBody:
      'Google sign-in, TOTP บังคับ, ข้อมูลแยกตามเจ้าของ และไม่ส่ง prompt หรือ brief เข้า monitoring logs',
    allProjects: 'บรีฟของคุณ',
    empty: 'ยังไม่มีโปรเจกต์ เริ่มจากไอเดียที่ยังอธิบายได้ไม่ชัด',
    initialIdea: 'ไอเดียคร่าว ๆ',
    create: 'สร้างและเริ่มสัมภาษณ์',
    title: 'ชื่อโปรเจกต์',
    cancel: 'ยกเลิก',
    interview: 'สัมภาษณ์',
    review: 'ตรวจบรีฟ',
    answer: 'คำตอบของคุณ',
    continue: 'บันทึกและไปต่อ',
    thinking: 'กำลังตรวจความเข้าใจ…',
    generate: 'สร้างบรีฟแบบมีโครงสร้าง',
    confidence: 'ความมั่นใจด้านความเข้าใจ',
    known: 'ข้อมูลจริง',
    assumed: 'สมมติ',
    partial: 'บางส่วน',
    missing: 'ยังขาด',
    clear: 'ชัดเจน',
    facts: 'ข้อเท็จจริงที่ยืนยันแล้ว',
    assumptions: 'สมมติฐานที่พบ',
    contradictions: 'ข้อมูลที่ขัดแย้ง',
    save: 'บันทึกการแก้ไข',
    approve: 'อนุมัติ snapshot',
    reject: 'ปฏิเสธและแก้เฉพาะจุด',
    sync: 'Sync เข้า Notion',
    notionParent: 'Notion parent page ID',
    setParent: 'ตั้งค่า parent',
    versions: 'ประวัติเวอร์ชัน',
    alignment: 'ความเข้าใจที่ดีขึ้น',
    from: 'Prompt เริ่มต้น',
    to: 'หลังสัมภาษณ์',
    decisions: 'เรื่องที่มนุษย์ยังต้องตัดสินใจ',
    retry: 'ลองประมวลผลคำตอบที่บันทึกแล้วอีกครั้ง',
    status: 'สถานะ',
    secureSetup: 'ตั้งค่าความปลอดภัยสองชั้นให้เสร็จ',
    secureBody:
      'Lumixia Brief บังคับใช้ TOTP ก่อนเปิดข้อมูลโปรเจกต์ ตั้งค่าแอป Authenticator ในเมนู Security และเก็บ backup codes ไว้',
  },
} as const;

type Locale = keyof typeof messages;
type MessageKey = keyof (typeof messages)['en'];

const I18nContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
}>({ locale: 'en', setLocale: () => undefined, t: (key) => messages.en[key] });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    localStorage.getItem('lumixia-locale') === 'th' ? 'th' : 'en',
  );
  const value = useMemo(
    () => ({
      locale,
      setLocale(next: Locale) {
        localStorage.setItem('lumixia-locale', next);
        document.documentElement.lang = next;
        setLocaleState(next);
      },
      t: (key: MessageKey) => messages[locale][key],
    }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
