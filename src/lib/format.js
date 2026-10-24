export const formatINR = (value, options = {}) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
  ...options,
}).format(Number(value) || 0)

export const formatDate = (value, withTime = false) => new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
}).format(new Date(value))

export const todayInput = () => {
  const pieces = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const get = (type) => pieces.find((part) => part.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
