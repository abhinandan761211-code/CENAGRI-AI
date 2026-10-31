import Header from "@/components/Header";
import Hero from "@/components/Hero";
import TrustStrip from "@/components/TrustStrip";
import ForWhom from "@/components/ForWhom";
import HowItWorks from "@/components/HowItWorks";
import WhyChoose from "@/components/WhyChoose";
import VideoSection from "@/components/VideoSection";
import Testimonials from "@/components/Testimonials";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Hero />
        <TrustStrip />
        <ForWhom />
        <HowItWorks />
        <WhyChoose />
        <VideoSection />
        <Testimonials />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
