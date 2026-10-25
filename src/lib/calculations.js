const money = (value) => Math.round((Number(value) || 0) * 100) / 100

const asNumber = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function calculateLine(item = {}) {
  const lineTotalValue = asNumber(item.line_total ?? item.final_amount ?? 0)
  const unitPriceValue = asNumber(item.unit_price ?? item.price ?? item.amount ?? 0)
  const price = Math.max(0, money(unitPriceValue || lineTotalValue))
  const explicitDiscount = asNumber(item.discount ?? item.discount_amount ?? 0)
  const inferredDiscount = lineTotalValue > 0 && unitPriceValue > 0 ? Math.max(0, price - money(lineTotalValue)) : 0
  const discount = Math.min(price, Math.max(0, money(explicitDiscount || inferredDiscount)))
  const finalTotal = money(item.line_total ?? item.final_amount ?? price - discount)

  return {
    ...item,
    unit_price: price,
    discount,
    line_total: finalTotal,
  }
}

export function calculateBill(items, giftCardBalance = 0) {
  const lines = (items || [])
    .map(calculateLine)
    .filter((item) => item.name?.trim() || item.service_name?.trim())
  const subtotal = money(lines.reduce((total, line) => total + line.unit_price, 0))
  const totalDiscount = money(lines.reduce((total, line) => total + line.discount, 0))
  const netAmount = money(lines.reduce((total, line) => total + line.line_total, 0))
  const giftCardAmount = Math.min(netAmount, Math.max(0, money(giftCardBalance)))

  return {
    lines,
    subtotal,
    totalDiscount,
    netAmount,
    giftCardAmount: money(giftCardAmount),
    physicalAmount: money(netAmount - giftCardAmount),
  }
}

export function aggregateBills(bills, { from, to } = {}) {
  const selected = (bills || []).filter((bill) => {
    const dateValue = bill.created_at ?? bill.issued_at ?? bill.bill_date
    const date = indiaDateKey(dateValue)
    if (!date) return false
    return (!from || date >= from) && (!to || date <= to)
  })
  const byService = new Map()
  let grossServiceValue = 0
  let discounts = 0
  let netServiceRevenue = 0
  let physicalCollections = 0
  let giftCardRedemptions = 0
  let totalServices = 0

  selected.forEach((bill) => {
    grossServiceValue += asNumber(bill.subtotal ?? bill.gross_amount, 0)
    discounts += asNumber(bill.total_discount ?? bill.discount_amount ?? bill.discount ?? 0, 0)
    netServiceRevenue += asNumber(bill.net_amount ?? bill.final_amount ?? bill.total ?? 0, 0)
    physicalCollections += asNumber(bill.physical_amount, 0)
    giftCardRedemptions += asNumber(bill.gift_card_amount ?? bill.giftCardAmount, 0)
    ;(bill.items || bill.bill_items || []).forEach((item) => {
      const key = item.service_name || item.name || 'Custom service'
      const existing = byService.get(key) || { name: key, count: 0, revenue: 0 }
      existing.count += 1
      existing.revenue += asNumber(item.line_total ?? item.final_price ?? item.final_amount ?? item.amount, 0)
      byService.set(key, existing)
      totalServices += 1
    })
  })

  return {
    bills: selected,
    grossServiceValue: money(grossServiceValue),
    discounts: money(discounts),
    netServiceRevenue: money(netServiceRevenue),
    physicalCollections: money(physicalCollections),
    giftCardRedemptions: money(giftCardRedemptions),
    totalBills: selected.length,
    totalServices,
    byService: [...byService.values()].sort((a, b) => b.revenue - a.revenue),
  }
}

export function dateRangeForPreset(preset) {
  const now = indiaCalendarDate()
  const iso = (date) => date.toISOString().slice(0, 10)
  const start = new Date(now)
  if (preset === 'day') return { from: iso(now), to: iso(now) }
  if (preset === 'week') start.setDate(now.getDate() - 6)
  if (preset === 'month') start.setDate(1)
  if (preset === 'year') start.setMonth(0, 1)
  return { from: iso(start), to: iso(now) }
}

export function revenueChartData(bills, preset, now = new Date()) {
  const [year, month, day] = indiaDateKey(now).split('-').map(Number)
  const today = new Date(Date.UTC(year, month - 1, day, 12))
  const groups = []

  if (preset === 'day') {
    const todayKey = indiaDateKey(now)
    for (let bucket = 0; bucket < 6; bucket += 1) {
      const hour = bucket * 4
      groups.push({
        key: `${todayKey}-${bucket}`,
        label: `${String(hour).padStart(2, '0')}:00`,
        revenue: 0,
      })
    }
  } else if (preset === 'year') {
    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      const date = new Date(Date.UTC(year, monthIndex, 1, 12))
      groups.push({
        key: `${year}-${monthIndex}`,
        label: date.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }),
        revenue: 0,
      })
    }
  } else {
    const count = preset === 'month' ? day : 7
    for (let offset = count - 1; offset >= 0; offset -= 1) {
      const date = new Date(today)
      date.setUTCDate(date.getUTCDate() - offset)
      const dateKey = indiaDateKey(date)
      groups.push({
        key: dateKey,
        label: preset === 'month'
          ? String(date.getUTCDate())
          : date.toLocaleString('en-IN', { weekday: 'short', timeZone: 'UTC' }),
        revenue: 0,
      })
    }
  }

  bills.forEach((bill) => {
    const dateValue = bill.created_at ?? bill.issued_at ?? bill.bill_date
    const dateKey = indiaDateKey(dateValue)
    let key = dateKey
    if (preset === 'year' && dateKey) {
      const [billYear, billMonth] = dateKey.split('-')
      key = `${billYear}-${Number(billMonth) - 1}`
    } else if (preset === 'day' && dateKey) {
      const timestamp = new Date(dateValue)
      const hour = Number(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(timestamp))
      key = `${dateKey}-${Math.floor(hour / 4)}`
    }
    const group = groups.find((item) => item.key === key)
    if (group) group.revenue = money(group.revenue + asNumber(bill.net_amount))
  })

  return groups
}

export { money }

export function indiaDateKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const pieces = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type) => pieces.find((part) => part.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

function indiaCalendarDate() {
  const [year, month, day] = indiaDateKey(new Date()).split('-').map(Number)
  // UTC noon preserves the Indian civil date when adding or subtracting days.
  return new Date(Date.UTC(year, month - 1, day, 12))
}
