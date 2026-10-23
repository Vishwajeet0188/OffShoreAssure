/* Shared test data. */
/* The worked example from the Stage 1 spec (UK Company Ltd, IT Support). */
export const EXAMPLE = {
  buyerLegalName: 'UK Company Ltd', companyRegNumber: '01234567', buyerCountry: 'GB', buyerSector: 'Financial Services', buyerContactEmail: 'sarah@ukcompany.example',
  assessmentTitle: 'Global IT Support', serviceCategory: 'IT Support', serviceDescription: '24/7 service desk, incident handling and user account administration for 2,000 staff.',
  businessObjective: 'Cost reduction and service continuity.', serviceCriticality: 'High', deliveryModel: 'Remote', supportHours: '24/7',
  preferredCountries: ['PL'], restrictedCountries: [], startDate: '2027-01-04', contractDuration: 36, estimatedBudget: 480000, currency: 'GBP',
  personalData: 'Yes', dataSubjectCategories: ['Employees', 'Customers'], personalDataCategories: ['Names', 'Contact details (email, phone)', 'Ticket / case records'],
  specialCategory: 'No', criminalOffence: 'No', dataVolume: 10000,
  privilegedAccess: 'Yes', systemsAccessed: ['Service desk / ticketing', 'Identity / directory (AD, Entra ID)'], storageCountries: ['US'], remoteAccessCountries: ['PL', 'IN', 'BR', 'PH'],
  subprocessors: 'Approval required', cloudServices: 'Yes', assuranceRequirements: ['ISO 27001 certification', 'Multi-factor authentication (MFA)', 'Business continuity & disaster recovery plan'], riskTolerance: 'Medium'
};
