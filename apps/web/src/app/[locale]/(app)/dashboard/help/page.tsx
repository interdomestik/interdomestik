import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui/components/card';
import { Mail, MessageSquare, Phone } from 'lucide-react';

export default function HelpPage() {
  return (
    <div className="flex flex-col h-full space-y-8 p-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Help & Support</h1>
        <p className="text-muted-foreground mt-2">
          Need assistance with your claim or have questions about our services? reach out to our
          team.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Direct Contact */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Contact Support</CardTitle>
            <CardDescription>Our team is available Monday to Friday, 9:00 - 17:00.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <Button variant="outline" className="h-24 flex-col gap-2" asChild>
              <a href="tel:+38349900600">
                <Phone className="h-6 w-6" />
                <span className="font-semibold text-lg">049 900 600</span>
                <span className="text-xs text-muted-foreground">Call Us</span>
              </a>
            </Button>

            <Button variant="outline" className="h-24 flex-col gap-2" asChild>
              <a href="mailto:info@interdomestik.com">
                <Mail className="h-6 w-6" />
                <span className="font-semibold text-lg">Email Us</span>
                <span className="text-xs text-muted-foreground">info@interdomestik.com</span>
              </a>
            </Button>

            <Button variant="outline" className="h-24 flex-col gap-2" asChild>
              <a href="https://wa.me/38349900600" target="_blank" rel="noopener noreferrer">
                <MessageSquare className="h-6 w-6 text-green-600" />
                <span className="font-semibold text-lg">WhatsApp</span>
                <span className="text-xs text-muted-foreground">Chat with us</span>
              </a>
            </Button>
          </CardContent>
        </Card>

        {/* FAQ Links (Placeholder) */}
        <Card>
          <CardHeader>
            <CardTitle>Common Questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-medium text-sm">How long does a claim take?</h3>
              <p className="text-sm text-muted-foreground">
                Typically 2-4 weeks for initial assessment.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-sm">What documents do I need?</h3>
              <p className="text-sm text-muted-foreground">
                Proof of purchase, photos of damage, and incident report.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Legal Resources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="link" className="px-0 h-auto" asChild>
              <Link href="/dashboard/rights">Consumer Rights Guide &rarr;</Link>
            </Button>
            <div className="text-sm text-muted-foreground">
              Learn about your rights under current consumer protection laws.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
