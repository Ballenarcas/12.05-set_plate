import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Eye, EyeOff, Sparkles } from 'lucide-react'
import { submitUserOnboarding } from '../services/api'
import { describeError } from '../utils/errors.js'
import type { FitnessGoal, UserOnboardingFormData } from '../types'
import '../styles/onboarding.css'

const initialFormData: UserOnboardingFormData = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
  agreedToTerms: false,
  birthDate: '',
  gender: 'Male',
  weight: '',
  height: '',
  mainGoal: 'Hypertrophy',
}

function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [formData, setFormData] = useState<UserOnboardingFormData>(initialFormData)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleInputChange = (field: keyof UserOnboardingFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  // Validation for Screen 1
  const validateScreen1 = (): boolean => {
    const newErrors: Record<string, string> = {}

    const trimmedFirstName = formData.firstName.trim()
    if (!trimmedFirstName) {
      newErrors.firstName = 'First name is required'
    } else if (trimmedFirstName.length > 15) {
      newErrors.firstName = 'First name cannot exceed 15 characters'
    }

    const trimmedLastName = formData.lastName.trim()
    if (!trimmedLastName) {
      newErrors.lastName = 'Last name is required'
    } else if (trimmedLastName.length > 25) {
      newErrors.lastName = 'Last name cannot exceed 25 characters'
    }

    const trimmedEmail = formData.email.trim()
    if (!trimmedEmail) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 12) {
      newErrors.password = 'Password must be at least 12 characters'
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Confirm your password'
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    if (!formData.agreedToTerms) {
      newErrors.agreedToTerms = 'You must agree to the Terms and Conditions to continue'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Validation for Screen 2
  const validateScreen2 = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.birthDate) {
      newErrors.birthDate = 'Birth date is required'
    } else {
      const [year, month, day] = formData.birthDate.split('-').map(Number)
      const birth = new Date(year, month - 1, day)
      const today = new Date()
      if (isNaN(birth.getTime()) || birth > today) {
        newErrors.birthDate = 'Please enter a valid birth date'
      } else {
        let calculatedAge = today.getFullYear() - birth.getFullYear()
        const monthDiff = today.getMonth() - birth.getMonth()
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
          calculatedAge--
        }
        if (isNaN(calculatedAge) || calculatedAge < 12 || calculatedAge > 120) {
          newErrors.birthDate = 'Age must be between 12 and 120 years'
        }
      }
    }

    if (!formData.gender) {
      newErrors.gender = 'Gender is required'
    }

    const trimmedWeight = formData.weight.trim()
    if (!trimmedWeight) {
      newErrors.weight = 'Weight is required'
    } else {
      const parsedWeight = parseFloat(trimmedWeight)
      if (isNaN(parsedWeight) || !/^\d+(\.\d+)?$/.test(trimmedWeight)) {
        newErrors.weight = 'Weight must be a valid number'
      } else if (parsedWeight < 20 || parsedWeight > 350) {
        newErrors.weight = 'Weight must be between 20 and 350 kg'
      }
    }

    const trimmedHeight = formData.height.trim()
    if (!trimmedHeight) {
      newErrors.height = 'Height is required'
    } else {
      const parsedHeight = parseInt(trimmedHeight, 10)
      if (isNaN(parsedHeight) || !/^\d+$/.test(trimmedHeight)) {
        newErrors.height = 'Height must be a valid whole number'
      } else if (parsedHeight < 80 || parsedHeight > 250) {
        newErrors.height = 'Height must be between 80 and 250 cm'
      }
    }

    if (!formData.mainGoal) {
      newErrors.mainGoal = 'Main goal is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault()
    if (validateScreen1()) {
      setStep(2)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleCompleteSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateScreen2()) return

    setIsSubmitting(true)
    setSubmitError(null)
    try {
      await submitUserOnboarding(formData)
      setStep(3) // Success state
      setTimeout(() => {
        navigate('/')
      }, 1600)
    } catch (err: unknown) {
      const message = describeError(err, "We couldn't save your profile. Please try again.")
      setSubmitError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    navigate('/')
  }

  const handleBack = () => {
    setErrors({})
    setSubmitError(null)
    setStep(1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="onboarding-container">
      {/* Screen 3: Success Confirmation */}
      {step === 3 && (
        <div className="completion-overlay">
          <div className="completion-icon-wrapper">
            <Sparkles size={34} />
          </div>
          <h1 className="onboarding-title">Welcome, {formData.firstName}!</h1>
          <p className="onboarding-subtitle">
            Your personalized training &amp; nutrition plan is ready.
          </p>
        </div>
      )}

      {/* Screens 1 & 2 */}
      {step !== 3 && (
        <div className="onboarding-content">
          {/* Progress Header */}
          <div className="onboarding-progress">
            <div className="onboarding-progress-bar">
              <div
                className="onboarding-progress-fill"
                style={{ width: step === 1 ? '50%' : '100%' }}
              />
            </div>
            <span className="onboarding-step-counter">
              Step {step} of 2
            </span>
          </div>

          {/* SCREEN 1: AUTHENTICATION */}
          {step === 1 && (
            <>
              <header className="onboarding-header">
                <h1 className="onboarding-title">Create Account</h1>
                <p className="onboarding-subtitle">Sign up to get started</p>
              </header>

              <form className="onboarding-form" onSubmit={handleNext} noValidate>
                {/* First Name */}
                <div className="form-field">
                  <label htmlFor="firstName" className="form-label">
                    First Name <span className="required-star" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    maxLength={15}
                    className={`form-input${errors.firstName ? ' has-error' : ''}`}
                    placeholder="e.g. Alex"
                    value={formData.firstName}
                    onChange={(e) => handleInputChange('firstName', e.target.value)}
                    autoComplete="given-name"
                  />
                  {errors.firstName && <span className="error-text">{errors.firstName}</span>}
                </div>

                {/* Last Name */}
                <div className="form-field">
                  <label htmlFor="lastName" className="form-label">
                    Last Name <span className="required-star" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    maxLength={25}
                    className={`form-input${errors.lastName ? ' has-error' : ''}`}
                    placeholder="e.g. Rivera"
                    value={formData.lastName}
                    onChange={(e) => handleInputChange('lastName', e.target.value)}
                    autoComplete="family-name"
                  />
                  {errors.lastName && <span className="error-text">{errors.lastName}</span>}
                </div>

                {/* Email */}
                <div className="form-field">
                  <label htmlFor="email" className="form-label">
                    Email <span className="required-star" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="email"
                    type="email"
                    className={`form-input${errors.email ? ' has-error' : ''}`}
                    placeholder="name@example.com"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    autoComplete="email"
                  />
                  {errors.email && <span className="error-text">{errors.email}</span>}
                </div>

                {/* Password */}
                <div className="form-field">
                  <label htmlFor="password" className="form-label">
                    Password <span className="required-star" aria-hidden="true">*</span>
                  </label>
                  <div className="input-wrapper">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      className={`form-input${errors.password ? ' has-error' : ''}`}
                      placeholder="At least 12 characters"
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {errors.password && <span className="error-text">{errors.password}</span>}
                </div>

                {/* Confirm Password */}
                <div className="form-field">
                  <label htmlFor="confirmPassword" className="form-label">
                    Confirm Password <span className="required-star" aria-hidden="true">*</span>
                  </label>
                  <div className="input-wrapper">
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      className={`form-input${errors.confirmPassword ? ' has-error' : ''}`}
                      placeholder="Repeat your password"
                      value={formData.confirmPassword}
                      onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <span className="error-text">{errors.confirmPassword}</span>
                  )}
                </div>

                {/* Extra: Terms & Conditions Checkbox */}
                <div className="form-field">
                  <label className="terms-row">
                    <div className="custom-checkbox">
                      <input
                        type="checkbox"
                        checked={formData.agreedToTerms}
                        onChange={(e) => handleInputChange('agreedToTerms', e.target.checked)}
                      />
                      <div className="checkbox-visual" aria-hidden="true">
                        <Check size={13} strokeWidth={3} />
                      </div>
                    </div>
                    <span className="terms-text">
                      I agree to the <span className="terms-link">Terms and Conditions</span>{' '}
                      <span className="required-star" aria-hidden="true">*</span>
                    </span>
                  </label>
                  {errors.agreedToTerms && (
                    <span className="error-text">{errors.agreedToTerms}</span>
                  )}
                </div>

                {/* Screen 1 Actions */}
                <div className="onboarding-actions">
                  <button type="submit" className="btn-primary-outline">
                    Next
                  </button>
                  <button type="button" className="btn-secondary-outline" onClick={handleCancel}>
                    Cancel
                  </button>
                </div>
              </form>
            </>
          )}

          {/* SCREEN 2: FITNESS PROFILE */}
          {step === 2 && (
            <>
              <header className="onboarding-header">
                <h1 className="onboarding-title">Personalize Your Plan</h1>
                <p className="onboarding-subtitle">
                  We need some details to adjust your workouts
                </p>
              </header>

              <form className="onboarding-form" onSubmit={handleCompleteSignUp} noValidate>
                {/* Birth Date */}
                <div className="form-field">
                  <label htmlFor="birthDate" className="form-label">
                    Birth Date <span className="required-star" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="birthDate"
                    type="date"
                    autoComplete="bday"
                    className={`form-input${errors.birthDate ? ' has-error' : ''}`}
                    value={formData.birthDate}
                    onChange={(e) => handleInputChange('birthDate', e.target.value)}
                  />
                  {errors.birthDate && <span className="error-text">{errors.birthDate}</span>}
                </div>

                {/* Gender */}
                <div className="form-field">
                  <label className="form-label">
                    Gender <span className="required-star" aria-hidden="true">*</span>
                  </label>
                  <p className="field-hint">
                    Used strictly to accurately estimate your basal metabolic rate (BMR) and daily energy expenditure.
                  </p>
                  <div className="segmented-control" role="radiogroup" aria-label="Gender selection">
                    {(['Male', 'Female', 'Other'] as const).map((genderOption) => (
                      <button
                        key={genderOption}
                        type="button"
                        role="radio"
                        aria-checked={formData.gender === genderOption}
                        className={`segmented-option${
                          formData.gender === genderOption ? ' is-selected' : ''
                        }`}
                        onClick={() => handleInputChange('gender', genderOption)}
                      >
                        {genderOption}
                      </button>
                    ))}
                  </div>
                  {errors.gender && <span className="error-text">{errors.gender}</span>}
                </div>

                {/* Weight & Height Row */}
                <div className="form-row">
                  {/* Weight (kg) */}
                  <div className="form-field">
                    <label htmlFor="weight" className="form-label">
                      Weight (kg) <span className="required-star" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="weight"
                      type="number"
                      step="0.1"
                      inputMode="decimal"
                      className={`form-input${errors.weight ? ' has-error' : ''}`}
                      placeholder="e.g. 74.5"
                      value={formData.weight}
                      onChange={(e) => handleInputChange('weight', e.target.value)}
                    />
                    {errors.weight && <span className="error-text">{errors.weight}</span>}
                  </div>

                  {/* Height (cm) */}
                  <div className="form-field">
                    <label htmlFor="height" className="form-label">
                      Height (cm) <span className="required-star" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="height"
                      type="number"
                      inputMode="numeric"
                      className={`form-input${errors.height ? ' has-error' : ''}`}
                      placeholder="e.g. 178"
                      value={formData.height}
                      onChange={(e) => handleInputChange('height', e.target.value)}
                    />
                    {errors.height && <span className="error-text">{errors.height}</span>}
                  </div>
                </div>

                {/* Main Goal */}
                <div className="form-field">
                  <label htmlFor="mainGoal" className="form-label">
                    Main Goal <span className="required-star" aria-hidden="true">*</span>
                  </label>
                  <select
                    id="mainGoal"
                    className="form-input form-select"
                    value={formData.mainGoal}
                    onChange={(e) => handleInputChange('mainGoal', e.target.value as FitnessGoal)}
                  >
                    <option value="Lose Weight">Lose Weight</option>
                    <option value="Strength">Strength</option>
                    <option value="Hypertrophy">Hypertrophy</option>
                  </select>
                  {errors.mainGoal && <span className="error-text">{errors.mainGoal}</span>}
                </div>

                {submitError && (
                  <div className="global-error-banner" role="alert">
                    {submitError}
                  </div>
                )}

                {/* Screen 2 Actions */}
                <div className="onboarding-actions">
                  <button
                    type="submit"
                    className="btn-primary-outline"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Creating Plan...' : 'Complete Sign Up'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary-outline"
                    onClick={handleBack}
                    disabled={isSubmitting}
                  >
                    Back
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default Onboarding
