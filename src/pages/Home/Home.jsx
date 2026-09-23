import Header from '../../components/Home/Header'
import Hero from '../../components/Home/Hero'
import AssuranceJourney from '../../components/Home/AssuranceJourney'
import AssuranceEngines from '../../components/Home/AssuranceEngines'
import EvidenceRoom from '../../components/Home/EvidenceRoom'
import BuyerDecision from '../../components/Home/BuyerDecision'
import FinalCTA from '../../components/Home/FinalCTA'
import Footer from '../../components/Home/Footer'

function Home() {
  return (
    <div className="min-h-screen bg-[#F7F9FC] text-[#172033]">
      <Header />

      <main>
        <Hero />
        <AssuranceJourney />
        <AssuranceEngines />
        <EvidenceRoom />
        <BuyerDecision />
        <FinalCTA />
      </main>

      <Footer />
    </div>
  )
}

export default Home