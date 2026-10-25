import { describe, expect, it } from 'vitest'
import { aggregateBills, calculateBill, revenueChartData } from './calculations'

describe('calculateBill', () => {
  it('calculates per-line discount, total, and physical payment', () => {
    const result = calculateBill([
      { name: 'Hair Cut', unit_price: 300, discount: 50 },
      { name: 'Facial', unit_price: 1500, discount: 200 },
    ])

    expect(result.subtotal).toBe(1800)
    expect(result.totalDiscount).toBe(250)
    expect(result.netAmount).toBe(1550)
    expect(result.giftCardAmount).toBe(0)
    expect(result.physicalAmount).toBe(1550)
  })

  it('accepts discount_amount fields and keeps totals consistent', () => {
    const result = calculateBill([
      { name: 'Hair Cut', unit_price: 300, discount_amount: 50 },
      { name: 'Facial', unit_price: 1500, discount_amount: 200 },
    ])

    expect(result.subtotal).toBe(1800)
    expect(result.totalDiscount).toBe(250)
    expect(result.netAmount).toBe(1550)
  })

  it('redeems only the available gift-card balance', () => {
    const result = calculateBill([{ name: 'Makeup', unit_price: 1200, discount: 0 }], 600)

    expect(result.giftCardAmount).toBe(600)
    expect(result.physicalAmount).toBe(600)
  })

  it('never lets a line discount exceed its price', () => {
    const result = calculateBill([{ name: 'Threading', unit_price: 200, discount: 500 }])

    expect(result.lines[0].discount).toBe(200)
    expect(result.lines[0].line_total).toBe(0)
  })
})

describe('aggregateBills', () => {
  it('keeps revenue, collections, and gift-card redemption separate', () => {
    const stats = aggregateBills([{
      created_at: '2026-10-24T10:00:00.000Z',
      subtotal: 1200,
      total_discount: 100,
      net_amount: 1100,
      physical_amount: 500,
      gift_card_amount: 600,
      items: [
        { service_name: 'Facial', line_total: 900 },
        { service_name: 'Threading', line_total: 200 },
      ],
    }])

    expect(stats.grossServiceValue).toBe(1200)
    expect(stats.discounts).toBe(100)
    expect(stats.netServiceRevenue).toBe(1100)
    expect(stats.physicalCollections).toBe(500)
    expect(stats.giftCardRedemptions).toBe(600)
    expect(stats.totalBills).toBe(1)
    expect(stats.totalServices).toBe(2)
    expect(stats.byService[0]).toEqual({ name: 'Facial', count: 1, revenue: 900 })
  })

  it('supports bill rows that use discount_amount and bill_date instead of created_at', () => {
    const stats = aggregateBills([{
      bill_date: '2026-10-24',
      gross_amount: 1200,
      discount_amount: 100,
      net_amount: 1100,
      physical_amount: 500,
      gift_card_amount: 600,
      bill_items: [
        { service_name: 'Facial', final_amount: 900 },
        { service_name: 'Threading', final_amount: 200 },
      ],
    }], { from: '2026-10-24', to: '2026-10-24' })

    expect(stats.totalBills).toBe(1)
    expect(stats.discounts).toBe(100)
    expect(stats.giftCardRedemptions).toBe(600)
    expect(stats.byService[0]).toEqual({ name: 'Facial', count: 1, revenue: 900 })
  })
})

describe('revenueChartData', () => {
  const now = new Date('2026-10-25T12:00:00.000Z')
  const bills = [
    { created_at: '2026-10-25T02:00:00.000Z', net_amount: 300 },
    { created_at: '2026-10-24T10:00:00.000Z', net_amount: 500 },
    { created_at: '2026-01-10T06:00:00.000Z', net_amount: 700 },
  ]

  it('shows every elapsed day in the current month and groups bills by India date', () => {
    const chart = revenueChartData(bills, 'month', now)

    expect(chart).toHaveLength(25)
    expect(chart[0]).toMatchObject({ label: '1', revenue: 0 })
    expect(chart[23]).toMatchObject({ label: '24', revenue: 500 })
    expect(chart[24]).toMatchObject({ label: '25', revenue: 300 })
  })

  it('shows the selected calendar year and bins today by India time', () => {
    const yearlyChart = revenueChartData(bills, 'year', now)
    const dailyChart = revenueChartData(bills, 'day', now)

    expect(yearlyChart).toHaveLength(12)
    expect(yearlyChart[0]).toMatchObject({ label: 'Jan', revenue: 700 })
    expect(yearlyChart[9]).toMatchObject({ label: 'Oct', revenue: 800 })
    expect(dailyChart).toHaveLength(6)
    expect(dailyChart[1]).toMatchObject({ label: '04:00', revenue: 300 })
    expect(dailyChart[5].revenue).toBe(0)
  })
})
