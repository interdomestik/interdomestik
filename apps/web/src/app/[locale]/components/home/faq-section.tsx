'use client';

import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function FAQSection() {
  const t = useTranslations('faq');
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const questions = [
    { id: 'hotline', question: t('questions.0.question'), answer: t('questions.0.answer') },
    { id: 'process', question: t('questions.1.question'), answer: t('questions.1.answer') },
    { id: 'timing', question: t('questions.2.question'), answer: t('questions.2.answer') },
    { id: 'fees', question: t('questions.3.question'), answer: t('questions.3.answer') },
    { id: 'documents', question: t('questions.4.question'), answer: t('questions.4.answer') },
  ];

  return (
    <section className="py-16 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-display font-black mb-4 text-slate-900 tracking-tight">
            {t('title')}
          </h2>
          <p className="text-slate-800 text-lg font-medium">{t('subtitle')}</p>
        </div>

        <div className="max-w-3xl mx-auto">
          {questions.map((item, index) => (
            <div key={item.id} className="border-b border-slate-200 last:border-b-0">
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full py-6 flex items-center justify-between text-left group"
              >
                <div className="text-xs uppercase tracking-[0.2em] font-bold text-slate-800 group-hover:text-primary transition-colors duration-300">
                  {item.question}
                </div>
                <ChevronDown
                  className={`h-5 w-5 text-slate-800 shrink-0 transition-transform duration-200 ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                />
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  openIndex === index ? 'max-h-96 pb-6' : 'max-h-0'
                }`}
              >
                <p className="text-sm text-slate-800 leading-relaxed font-medium px-2">
                  {item.answer}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
