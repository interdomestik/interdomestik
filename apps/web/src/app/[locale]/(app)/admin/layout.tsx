import { ADMIN_NAMESPACES, pickMessages } from '@/i18n/messages';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import React from 'react';

type Props = {
  children: React.ReactNode;
};

export default async function AdminLayout({ children }: Props) {
  const messages = await getMessages();
  const adminMessages = pickMessages(messages, ADMIN_NAMESPACES);

  return <NextIntlClientProvider messages={adminMessages}>{children}</NextIntlClientProvider>;
}
