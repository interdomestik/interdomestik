import { ThankYouLetterParams } from '@/lib/email/thank-you-letter';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function generateThankYouPDF(params: ThankYouLetterParams): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Constants
  const margin = 50;
  let yPosition = height - margin;

  // Header Background
  page.drawRectangle({
    x: 0,
    y: height - 150,
    width: width,
    height: 150,
    color: rgb(0.06, 0.46, 0.43), // #0f766e
  });

  // Logo / Title
  page.drawText('Asistenca', {
    x: margin,
    y: height - 60,
    size: 30,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  page.drawText('Membership Confirmation', {
    x: margin,
    y: height - 90,
    size: 16,
    font: font,
    color: rgb(0.9, 0.9, 0.9),
  });

  yPosition = height - 180;

  // Welcome Message
  const welcomeTitle = params.locale === 'sq' ? 'Mirësevini në Familje!' : 'Welcome to the Family!';
  page.drawText(welcomeTitle, {
    x: margin,
    y: yPosition,
    size: 20,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  yPosition -= 30;

  page.drawText(`Dear ${params.memberName},`, {
    x: margin,
    y: yPosition,
    size: 12,
    font: font,
    color: rgb(0.2, 0.2, 0.2),
  });
  yPosition -= 20;

  const introText =
    params.locale === 'sq'
      ? 'Faleminderit që zgjodhët Asistenca për mbrojtjen tuaj. Anëtarësimi juaj është aktiv.'
      : 'Thank you for choosing Asistenca for your protection. Your membership is now active.';

  page.drawText(introText, {
    x: margin,
    y: yPosition,
    size: 11,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  yPosition -= 40;

  // Digital Member Card Visual
  // Standard Credit Card Size: 85.6mm x 53.98mm -> ~243pt x 153pt
  const cardWidth = 280;
  const cardHeight = 170;
  const cardX = margin;
  const cardY = yPosition - cardHeight - 10;

  // Card Background (Dark Slate)
  page.drawRectangle({
    x: cardX,
    y: cardY,
    width: cardWidth,
    height: cardHeight,
    color: rgb(0.1, 0.1, 0.15), // Dark background
    borderColor: rgb(0.2, 0.2, 0.3),
    borderWidth: 1,
    // Note: pdf-lib drawRectangle doesn't support rounded corners directly in this version
    // but the aesthetic will be clean dark card
  });

  // Card Header: Asistenca + Logo
  page.drawText('Asistenca', {
    x: cardX + 20,
    y: cardY + cardHeight - 35,
    size: 18,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  const activeLabel = params.locale === 'sq' ? 'AKTIV' : 'ACTIVE';
  // Active Badge
  page.drawRectangle({
    x: cardX + cardWidth - 70,
    y: cardY + cardHeight - 35,
    width: 50,
    height: 18,
    color: rgb(1, 1, 1),
  });
  page.drawText(activeLabel, {
    x: cardX + cardWidth - 65,
    y: cardY + cardHeight - 31,
    size: 10,
    font: boldFont,
    color: rgb(0.06, 0.46, 0.43), // Brand green text
  });

  // Member Name
  page.drawText(params.memberName, {
    x: cardX + 20,
    y: cardY + 45,
    size: 16,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  // Member ID Label & Value
  page.drawText('ID:', {
    x: cardX + 20,
    y: cardY + 80,
    size: 9,
    font: font,
    color: rgb(0.7, 0.7, 0.7),
  });
  page.drawText(params.memberNumber, {
    x: cardX + 20,
    y: cardY + 65,
    size: 12,
    font: font, // Monospace-like if available, or Helvetica
    color: rgb(1, 1, 1),
  });

  // Plan & Expiry
  page.drawText(params.planName.toUpperCase(), {
    x: cardX + 20,
    y: cardY + 110, // Higher up
    size: 10,
    font: boldFont,
    color: rgb(0.6, 0.8, 1), // Light blue tint
  });

  page.drawText(`${params.locale === 'sq' ? 'Skadon' : 'Exp'}: ${params.expiresAt}`, {
    x: cardX + 20,
    y: cardY + 20,
    size: 9,
    font: font,
    color: rgb(0.7, 0.7, 0.7),
  });

  yPosition = cardY; // Update cursor

  // Embed QR code ON the card
  if (params.qrCodeDataUrl) {
    try {
      const qrImageBytes = Buffer.from(params.qrCodeDataUrl.split(',')[1], 'base64');
      const qrImage = await pdfDoc.embedPng(qrImageBytes);
      const qrDims = qrImage.scale(0.4); // Smaller for card

      // Draw white background for QR
      page.drawRectangle({
        x: cardX + cardWidth - qrDims.width - 20 - 2,
        y: cardY + 20 - 2,
        width: qrDims.width + 4,
        height: qrDims.height + 4,
        color: rgb(1, 1, 1),
      });

      page.drawImage(qrImage, {
        x: cardX + cardWidth - qrDims.width - 20,
        y: cardY + 20,
        width: qrDims.width,
        height: qrDims.height,
      });
    } catch {
      // Ignore
    }
  }

  yPosition -= 40; // Space below card

  // Benefits
  page.drawText(params.locale === 'sq' ? 'PËRFITIMET KRYESORE' : 'KEY BENEFITS', {
    x: margin,
    y: yPosition,
    size: 11,
    font: boldFont,
    color: rgb(0.2, 0.2, 0.2),
  });
  yPosition -= 20;

  const benefits =
    params.locale === 'sq'
      ? [
          '• Linja Emergjente 24/7',
          '• Konsultime Ligjore nga Ekspertë',
          '• Menaxhim i Plotë i Ankesave',
          '• Kategorizimi i Lëndimeve',
        ]
      : [
          '• 24/7 Emergency Hotline',
          '• Expert Legal Consultations',
          '• Full Claims Management',
          '• Injury Categorization',
        ];

  for (const benefit of benefits) {
    page.drawText(benefit, {
      x: margin + 10,
      y: yPosition,
      size: 11,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
    });
    yPosition -= 18;
  }

  // Footer
  const footerText =
    params.locale === 'sq'
      ? 'Pyetje? Telefononi linjën tonë 24/7 ose na vizitoni në interdomestik.com'
      : 'Questions? Call our 24/7 hotline or visit interdomestik.com';

  page.drawText(footerText, {
    x: margin,
    y: 50,
    size: 10,
    font: font,
    color: rgb(0.5, 0.5, 0.5),
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
