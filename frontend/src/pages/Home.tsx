import Header from "@/components/Header";
import Hero from "@/components/Hero";
import TrustStrip from "@/components/TrustStrip";
import PlatformStats from "@/components/PlatformStats";
import ForWhom from "@/components/ForWhom";
import WhyChoose from "@/components/WhyChoose";
import HowItWorks from "@/components/HowItWorks";
import VideoSection from "@/components/VideoSection";
import Testimonials from "@/components/Testimonials";
import FAQ from "@/components/FAQ";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";
import "@/styles/landing.css";

/**
 * Public landing page.
 *
 * `landing` scopes the marketing theme (see `styles/landing.css`) so the app
 * screens keep their own palettes. The header overhangs the dark hero via a
 * negative margin, so the top of the page reads as one piece on every width.
 *
 * Content honesty rule for this page: no usage statistics and no testimonials
 * are shown unless they come from a real source. See PlatformStats and
 * Testimonials for the reasoning.
 */
export default function Home() {
  return (
    <div className="landing flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Hero />
        <TrustStrip />
        <PlatformStats />
        <ForWhom />
        <WhyChoose />
        <HowItWorks />
        <VideoSection />
        <Testimonials />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
