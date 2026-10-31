// Ready-made design specs per industry. They run through the same layout engine as AI designs, so they fit every format.

const P = {
  espresso: { bg: '#1f140f', bg2: '#3b2418', primary: '#e0a96d', text: '#fbf3ea', muted: '#cdb59c' },
  matcha: { bg: '#eef2e6', bg2: '#d7e3c4', primary: '#3f6b3a', text: '#1f2a1c', muted: '#4b5a45' },
  grill: { bg: '#b91c1c', bg2: '#450a0a', primary: '#fde047', text: '#ffffff', muted: '#fecaca' },
  noir: { bg: '#0a0a0a', bg2: '#262626', primary: '#f5f5f4', text: '#fafafa', muted: '#a3a3a3' },
  blush: { bg: '#fbe9e7', bg2: '#f7d6d0', primary: '#9f1239', text: '#3b0d17', muted: '#7f4a55' },
  sand: { bg: '#efe6d8', bg2: '#e2d3bb', primary: '#8a5a2b', text: '#2b1d10', muted: '#6b5640' },
  rosegold: { bg: '#1a1214', bg2: '#3a2228', primary: '#e6b980', text: '#fff5ef', muted: '#d9b8a8' },
  lavender: { bg: '#f3eefe', bg2: '#e2d7fb', primary: '#6d28d9', text: '#1e1236', muted: '#5b4b7a' },
  navy: { bg: '#0b1d33', bg2: '#12345a', primary: '#d4af37', text: '#f8fafc', muted: '#b8c4d4' },
  forest: { bg: '#0f2e25', bg2: '#1c4a3c', primary: '#c9a46a', text: '#f4f1ea', muted: '#b9c9bf' },
  campus: { bg: '#1e3a8a', bg2: '#3b82f6', primary: '#fde68a', text: '#ffffff', muted: '#dbeafe' },
  citrus: { bg: '#fff7ed', bg2: '#ffedd5', primary: '#ea580c', text: '#1c1917', muted: '#57534e' },
  clinic: { bg: '#0f766e', bg2: '#134e4a', primary: '#a7f3d0', text: '#f0fdfa', muted: '#ccfbf1' },
  fresh: { bg: '#f8fafc', bg2: '#e2e8f0', primary: '#0ea5e9', text: '#0f172a', muted: '#475569' },
  violet: { bg: '#2e1065', bg2: '#6d28d9', primary: '#facc15', text: '#ffffff', muted: '#ddd6fe' },
  coral: { bg: '#ff6b5b', bg2: '#c2410c', primary: '#1c1917', text: '#ffffff', muted: '#ffe4dc' },
  eid: { bg: '#0b3d2e', bg2: '#14532d', primary: '#e7c46a', text: '#fdf8ec', muted: '#cfe3d4' },
  ramadan: { bg: '#0f1029', bg2: '#2a1b5c', primary: '#f2c46d', text: '#fdf6e3', muted: '#c9c2e8' },
  jordan: { bg: '#111111', bg2: '#1f3d2b', primary: '#ce1126', text: '#ffffff', muted: '#d1d5db' },
};

const T = (id, industry, name, layout, palette, font, decor, headline, subheadline, cta = '', badge = '') =>
  ({ id, industry, name, spec: { layout, palette: P[palette], font, decor, headline, subheadline, cta, badge, body: '' } });

export const TEMPLATE_INDUSTRIES = ['مطاعم ومقاهي', 'أزياء وملابس', 'تجميل وعناية', 'عقارات', 'تعليم وتدريب', 'صحة وعيادات', 'تجارة إلكترونية', 'مناسبات'];

export const TEMPLATES = [
  T('cafe-morning', 'مطاعم ومقاهي', 'قهوة الصباح', 'split', 'espresso', 'Changa', 'dots', 'قهوة الصباح', 'ابدأ يومك بنكهة مختلفة', 'اطلب الآن'),
  T('food-deal', 'مطاعم ومقاهي', 'عرض الوجبة', 'sale', 'grill', 'Lalezar', 'lines', 'وجبة اليوم', 'طازجة ومحضّرة بحب', 'اطلب توصيل', 'خصم 25%'),
  T('winter-menu', 'مطاعم ومقاهي', 'قائمة موسمية', 'frame', 'matcha', 'El Messiri', 'none', 'قائمة الشتاء', 'مشروبات دافئة وحلويات منزلية', 'زورونا'),
  T('new-collection', 'أزياء وملابس', 'تشكيلة جديدة', 'split', 'noir', 'Reem Kufi', 'none', 'تشكيلة جديدة', 'أناقة تليق بك هذا الموسم', 'تسوّق الآن', 'جديد'),
  T('season-sale', 'أزياء وملابس', 'تخفيضات', 'sale', 'blush', 'Tajawal', 'orbs', 'تخفيضات الموسم', 'على تشكيلة مختارة', 'تسوّق', 'حتى 50%'),
  T('basics', 'أزياء وملابس', 'بسيط وأنيق', 'minimal', 'sand', 'Almarai', 'none', 'بساطة وأناقة', 'قطع أساسية لكل يوم', 'اكتشف'),
  T('glow', 'تجميل وعناية', 'إطلالة ساحرة', 'hero', 'rosegold', 'El Messiri', 'orbs', 'إطلالة ساحرة', 'جلسات عناية بالبشرة والشعر', 'احجزي موعدك'),
  T('bridal', 'تجميل وعناية', 'باقة العروس', 'frame', 'lavender', 'Amiri', 'dots', 'عرض العروس', 'مكياج وتسريحة وعناية متكاملة', 'احجزي الآن', 'باقة خاصة'),
  T('summer-care', 'تجميل وعناية', 'خصم الصيف', 'diagonal', 'rosegold', 'Tajawal', 'none', 'خصم الصيف', 'على جميع خدمات العناية', 'احجزي', '30%'),
  T('apartments', 'عقارات', 'شقق للبيع', 'split', 'navy', 'Cairo', 'none', 'شقق للبيع', 'تشطيب فاخر · إطلالة مميزة · أقساط مريحة', 'احجز معاينة'),
  T('own-home', 'عقارات', 'فرصة تملّك', 'diagonal', 'forest', 'Changa', 'dots', 'فرصتك للتملّك', 'مشروع سكني متكامل الخدمات', 'تواصل معنا', 'دفعة أولى 10%'),
  T('villa-rent', 'عقارات', 'فيلا للإيجار', 'minimal', 'sand', 'Readex Pro', 'none', 'فيلا للإيجار', 'مساحة واسعة وحديقة خاصة', 'اتصل الآن'),
  T('course', 'تعليم وتدريب', 'دورة تدريبية', 'hero', 'campus', 'Changa', 'dots', 'سجّل الآن', 'دورة تصميم الجرافيك للمبتدئين', 'احجز مقعدك', 'مقاعد محدودة'),
  T('workshop', 'تعليم وتدريب', 'ورشة مجانية', 'frame', 'citrus', 'Tajawal', 'orbs', 'ورشة عمل مجانية', 'التسويق الرقمي للمشاريع الصغيرة', 'سجّل مجاناً'),
  T('back-school', 'تعليم وتدريب', 'العودة للمدارس', 'sale', 'citrus', 'Lalezar', 'lines', 'العودة للمدارس', 'على جميع الحقائب والقرطاسية', 'تسوّق الآن', 'خصم 20%'),
  T('checkup', 'صحة وعيادات', 'فحص شامل', 'split', 'clinic', 'IBM Plex Sans Arabic', 'none', 'صحتك أولاً', 'فحص شامل بأحدث الأجهزة', 'احجز موعدك'),
  T('dental', 'صحة وعيادات', 'عيادة أسنان', 'minimal', 'fresh', 'Almarai', 'none', 'ابتسامة أجمل', 'عيادة الأسنان — خطوات بسيطة لنتيجة تدوم', 'استشارة مجانية'),
  T('free-test', 'صحة وعيادات', 'فحص مجاني', 'hero', 'fresh', 'Readex Pro', 'waves', 'فحص مجاني', 'قياس الضغط والسكري', 'زورونا', 'لفترة محدودة'),
  T('white-friday', 'تجارة إلكترونية', 'الجمعة البيضاء', 'sale', 'violet', 'Lalezar', 'orbs', 'الجمعة البيضاء', 'أكبر تخفيضات السنة', 'تسوّق الآن', 'حتى 70%'),
  T('free-shipping', 'تجارة إلكترونية', 'شحن مجاني', 'diagonal', 'coral', 'Cairo', 'none', 'شحن مجاني', 'على جميع الطلبات فوق 30 دينار', 'اطلب الآن'),
  T('just-in', 'تجارة إلكترونية', 'وصل حديثاً', 'split', 'violet', 'Changa', 'dots', 'وصل حديثاً', 'منتجات مختارة بعناية لك', 'اكتشف المزيد'),
  T('eid', 'مناسبات', 'عيد مبارك', 'frame', 'eid', 'Amiri', 'orbs', 'عيد مبارك', 'كل عام وأنتم بخير'),
  T('ramadan', 'مناسبات', 'رمضان كريم', 'frame', 'ramadan', 'El Messiri', 'dots', 'رمضان كريم', 'أعاده الله علينا وعليكم بالخير'),
  T('independence', 'مناسبات', 'عيد الاستقلال', 'hero', 'jordan', 'Reem Kufi', 'lines', 'عيد الاستقلال', 'كل عام والأردن بألف خير'),
];
