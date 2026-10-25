import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aggregateBills } from './calculations'

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    auth: { getSession: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: supabaseMock,
}))

import { dataApi } from './data'

describe('dataApi cloud persistence', () => {
  let localStorageMock
  let storage

  beforeEach(() => {
    vi.clearAllMocks()
    storage = new Map()
    localStorageMock = {
      getItem: vi.fn((key) => storage.get(key) || null),
      setItem: vi.fn((key, value) => storage.set(key, value)),
      removeItem: vi.fn((key) => storage.delete(key)),
    }
    vi.stubGlobal('localStorage', localStorageMock)
    vi.stubGlobal('sessionStorage', { getItem: vi.fn(() => null) })
    const profileQuery = {
      maybeSingle: async () => ({ data: { id: 'admin-id', role: 'admin' }, error: null }),
      eq: vi.fn(() => profileQuery),
    }
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-id' } } },
      error: null,
    })
    supabaseMock.from.mockImplementation((table) => {
      const query = table === 'profiles' ? profileQuery : {
        order: async () => ({
          data: table === 'services' ? null : [],
          error: table === 'services' ? new Error('Permission denied') : null,
        }),
      }
      return { select: () => query }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('surfaces cloud read failures instead of showing unrelated demo data', async () => {
    await expect(dataApi.getData()).rejects.toThrow('Permission denied')
    expect(localStorageMock.setItem).not.toHaveBeenCalled()
  })

  it('does not write a bill to demo storage when the cloud save fails', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: new Error('Bill RPC failed') })

    await expect(dataApi.saveBill({
      items: [{ name: 'Hair Cut', unit_price: 300, discount: 0 }],
    })).rejects.toThrow('Bill RPC failed')
    expect(localStorageMock.setItem).not.toHaveBeenCalled()
  })

  it('creates sequential cloud gift cards and surfaces issuance errors', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: { id: 'card-id', card_number: 'V102', original_value: 1000, remaining_balance: 1000 },
      error: null,
    })

    await expect(dataApi.createGiftCard(1000)).resolves.toMatchObject({
      card_number: 'V102',
      original_value: 1000,
      remaining_balance: 1000,
    })
    expect(supabaseMock.rpc).toHaveBeenCalledWith('create_gift_card', {
      p_original_value: 1000,
    })

    supabaseMock.rpc.mockResolvedValue({
      data: null,
      error: new Error('Gift card number already exists'),
    })
    await expect(dataApi.createGiftCard(500)).rejects.toThrow('Gift card number already exists')
    expect(localStorageMock.setItem).not.toHaveBeenCalled()
  })

  it('creates a cloud bill transactionally and returns its saved invoice details', async () => {
    const savedBill = {
      id: 'bill-id',
      bill_number: 'B0015',
      issued_at: '2026-10-25T12:00:00.000Z',
      gross_amount: 500,
      discount_amount: 0,
      net_amount: 500,
      gift_card_amount: 500,
      physical_amount: 0,
      gift_cards: { card_number: 'V100' },
      bill_items: [{
        service_name: 'Facial',
        unit_price: 500,
        discount_amount: 0,
        final_amount: 500,
      }],
    }
    supabaseMock.rpc.mockResolvedValue({ data: savedBill, error: null })
    supabaseMock.from.mockReturnValue({
      select: () => ({
        eq: () => ({ single: async () => ({ data: savedBill, error: null }) }),
      }),
    })

    const bill = await dataApi.saveBill({
      items: [{ name: 'Facial', unit_price: 500 }],
      giftCardNumber: 'V100',
    })

    expect(supabaseMock.rpc).toHaveBeenCalledWith('create_bill', {
      p_items: [{
        service_id: null,
        service_name: 'Facial',
        unit_price: 500,
        discount_amount: 0,
      }],
      p_gift_card_number: 'V100',
    })
    expect(bill).toMatchObject({
      id: 'bill-id',
      bill_number: 'B0015',
      net_amount: 500,
      gift_card_amount: 500,
      physical_amount: 0,
      gift_card_number: 'V100',
      items: [{ service_name: 'Facial', line_total: 500 }],
    })
  })

  it('requires a valid signed-in session instead of silently switching to demo mode', async () => {
    supabaseMock.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })

    await expect(dataApi.getData()).rejects.toThrow('Your session has expired.')
    expect(localStorageMock.setItem).not.toHaveBeenCalled()
  })

  it('loads only the signed-in user profile for cloud business data', async () => {
    supabaseMock.from.mockImplementation((table) => {
      const query = {
        order: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({ data: { id: 'admin-id', role: 'admin' }, error: null }),
        eq: vi.fn(() => query),
      }
      return { select: () => query }
    })

    await expect(dataApi.getData()).resolves.toMatchObject({
      profile: { id: 'admin-id', role: 'admin' },
      bills: [],
    })
    expect(supabaseMock.from.mock.results[3].value.select().eq).toHaveBeenCalledWith('id', 'admin-id')
  })

  it('explains that billing requires administrator access', async () => {
    supabaseMock.from.mockImplementation((table) => ({
      select: () => ({
        order: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({
          data: table === 'profiles' ? { role: 'staff' } : null,
          error: null,
        }),
        eq: () => ({
          maybeSingle: async () => ({
            data: table === 'profiles' ? { role: 'staff' } : null,
            error: null,
          }),
        }),
      }),
    }))

    await expect(dataApi.getData()).rejects.toThrow('does not have administrator access')
    expect(localStorageMock.setItem).not.toHaveBeenCalled()
  })

  it('keeps demo billing and gift-card refunds in the demo store', async () => {
    sessionStorage.getItem.mockReturnValue('yes')
    const bill = await dataApi.saveBill({
      items: [{ name: 'Test service', unit_price: 500, discount: 0 }],
      giftCardNumber: 'V100',
    })

    expect(bill.net_amount).toBe(500)
    expect(bill.gift_card_amount).toBe(500)
    expect(bill.physical_amount).toBe(0)

    let data = await dataApi.getData()
    expect(data.giftCards.find((card) => card.card_number === 'V100').remaining_balance).toBe(1500)
    expect(data.bills[0].id).toBe(bill.id)
    expect(aggregateBills(data.bills).netServiceRevenue).toBe(4650)

    await dataApi.deleteBill(bill.id)
    data = await dataApi.getData()
    const card = data.giftCards.find((item) => item.card_number === 'V100')
    expect(card.remaining_balance).toBe(2000)
    expect(card.gift_card_transactions[0].transaction_type).toBe('refund')
    expect(data.bills.some((item) => item.id === bill.id)).toBe(false)
    expect(aggregateBills(data.bills).netServiceRevenue).toBe(4150)
  })

  it('does not reuse a deleted demo bill number', async () => {
    sessionStorage.getItem.mockReturnValue('yes')
    const first = await dataApi.saveBill({
      items: [{ name: 'Test service', unit_price: 200 }],
    })
    await dataApi.deleteBill(first.id)
    const next = await dataApi.saveBill({
      items: [{ name: 'Test service', unit_price: 200 }],
    })

    expect(next.bill_number).not.toBe(first.bill_number)
  })

  it('generates unlimited sequential demo gift cards without reusing numbers', async () => {
    sessionStorage.getItem.mockReturnValue('yes')

    const cards = await Promise.all([
      dataApi.createGiftCard(1000),
      dataApi.createGiftCard(500),
      dataApi.createGiftCard(250),
    ])
    const data = await dataApi.getData()

    expect(cards.map((card) => card.card_number)).toEqual(['V102', 'V103', 'V104'])
    expect(new Set(data.giftCards.map((card) => card.card_number)).size).toBe(data.giftCards.length)
    expect(data.giftCards).toHaveLength(5)
  })
})
