type ContactInfo = {
  phone: string;
  whatsapp: string;
  address?: string;
  hours?: string;
};

const defaults: ContactInfo = {
  phone: '+383 49 900 600',
  whatsapp: 'https://wa.me/38349900600',
  address: 'Prishtina, Kosovo',
  hours: 'Mon–Fri, 09:00–17:00',
};

export const contactInfo: ContactInfo = {
  phone: process.env.NEXT_PUBLIC_CONTACT_PHONE || defaults.phone,
  whatsapp: process.env.NEXT_PUBLIC_CONTACT_WHATSAPP || defaults.whatsapp,
  address: process.env.NEXT_PUBLIC_CONTACT_ADDRESS || defaults.address,
  hours: process.env.NEXT_PUBLIC_CONTACT_HOURS || defaults.hours,
};
