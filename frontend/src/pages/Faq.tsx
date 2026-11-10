import { ChevronLeft, HelpCircle, Mail } from 'lucide-react'
import { useState } from 'react'
import { usePageNavigate } from '../utils/usePageNavigate'

const FAQ_ITEMS = [
  {
    question: "How does the AI Trainer work?",
    answer: "The AI trainer analyzes your workout history, current fatigue levels (RPE), and recent performance to suggest real-time adjustments to your sets, reps, and weights to optimize hypertrophy and prevent overtraining."
  },
  {
    question: "How do I log cardio exercises?",
    answer: "You can add cardio exercises from the catalog. The app includes a live timer for running, cycling, or rowing. You can also enter your duration and distance manually, and the app will calculate your pace automatically."
  },
  {
    question: "Can I edit a finished workout?",
    answer: "Yes, you can navigate to your History, select a past workout, and tap 'Edit'. This allows you to correct sets, update cardio times, or change the workout name without altering its original timestamp."
  },
  {
    question: "How is my workout volume calculated?",
    answer: "Total volume is calculated by multiplying the weight by the number of reps for all completed strength sets. Cardio blocks and incomplete sets are not included in the total weight volume."
  }
]

export default function Faq() {
  const navigate = usePageNavigate()
  const [showSupportMessage, setShowSupportMessage] = useState(false)
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div className="screen faq-screen">
      <header className="active-workout-header">
        <button className="icon-button" type="button" onClick={() => navigate('/profile')} aria-label="Back to profile">
          <ChevronLeft size={22} />
        </button>
        <div className="workout-title">
          <h1>Frequently Asked Questions</h1>
        </div>
      </header>

      <div className="faq-content" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Section FAQ */}
        <section className="faq-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {FAQ_ITEMS.map((item, index) => (
            <article 
              key={index} 
              className="card faq-card" 
              style={{ padding: '16px', cursor: 'pointer', backgroundColor: 'var(--well)', borderRadius: '12px' }}
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '16px', margin: 0, fontWeight: 600 }}>{item.question}</h3>
                <HelpCircle size={18} style={{ color: 'var(--text-muted)' }} />
              </div>
              {openIndex === index && (
                <p style={{ marginTop: '12px', fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {item.answer}
                </p>
              )}
            </article>
          ))}
        </section>

        {/* Section Support (Conforme à la PA) */}
        <section className="support-section" style={{ marginTop: '16px', paddingTop: '24px', borderTop: '1px solid var(--line)' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>Need more help?</h2>
          
          <button 
            className="secondary-action" 
            type="button" 
            onClick={() => setShowSupportMessage(true)}
            style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
          >
            <Mail size={18} /> Contact support
          </button>

          {showSupportMessage && (
            <div style={{ marginTop: '16px', padding: '16px', backgroundColor: 'var(--green-tint)', border: '1px solid var(--green-tint)', borderRadius: '8px', color: 'var(--green)', fontSize: '14px', textAlign: 'center', lineHeight: 1.5 }}>
              Please write an email to support@setandplate.com and we will respond asap
            </div>
          )}
        </section>
      </div>
    </div>
  )
};