import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { Nav } from "@/components/nav";
import { Pricing } from "@/components/pricing";
import { SocialProof } from "@/components/social-proof";

export default function Page() {
  return (
    <div className="min-h-screen bg-paper">
      <Nav />
      <Hero />
      <HowItWorks />
      <SocialProof />
      <Pricing />
      <Footer />
    </div>
  );
}
