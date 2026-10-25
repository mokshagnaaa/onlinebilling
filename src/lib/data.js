import { calculateBill } from './calculations'
import { supabase, isSupabaseConfigured } from './supabase'

const STORAGE_KEY = 'glamour-touch-demo-v3'
const DEMO_EMAIL = 'admin@glamourtouch.demo'

const seedServices = [
  ['S001', 'Hair Cut', 300, 'Hair'],
  ['S002', 'Hair Spa', 1200, 'Hair'],
  ['S003', 'Facial', 1500, 'Skin'],
  ['S004', 'Cleanup', 800, 'Skin'],
  ['S005', 'Threading', 200, 'Face'],
  ['S006', 'Waxing', 500, 'Body'],
  ['S007', 'Makeup', 3000, 'Makeup'],
].map(([service_code, name, default_price, category]) => ({
  id: crypto.randomUUID(), service_code, name, default_price, category, is_active: true,
}))

const initialDemo = () => {
  const services = seedServices.map((service) => ({ ...service }))
  const byName = (name) => services.find((service) => service.name === name)
  const timestamp = (daysAgo, hour) => {
    const date = new Date()
    date.setDate(date.getDate() - daysAgo)
    date.setHours(hour, 20, 0, 0)
    return date.toISOString()
  }
  const makeItem = (name, discount = 0) => {
    const service = byName(name)
    return {
      id: crypto.randomUUID(),
      service_id: service.id,
      service_name: service.name,
      unit_price: service.default_price,
      discount,
      line_total: service.default_price - discount,
    }
  }
  const cardId1 = crypto.randomUUID()
  const cardId2 = crypto.randomUUID()
  const billOneItems = [makeItem('Hair Cut', 50), makeItem('Facial', 200)]
  const billTwoItems = [makeItem('Hair Spa'), makeItem('Threading')]
  const billThreeItems = [makeItem('Cleanup'), makeItem('Waxing')]
  const sum = (items, key) => items.reduce((total, item) => total + item[key], 0)
  const billOne = { id: crypto.randomUUID(), bill_number: 'B0001', created_at: timestamp(0, 11), subtotal: sum(billOneItems, 'unit_price'), total_discount: sum(billOneItems, 'discount'), net_amount: sum(billOneItems, 'line_total'), gift_card_amount: 0, physical_amount: sum(billOneItems, 'line_total'), items: billOneItems }
  const billTwo = { id: crypto.randomUUID(), bill_number: 'B0002', created_at: timestamp(1, 15), subtotal: sum(billTwoItems, 'unit_price'), total_discount: 0, net_amount: sum(billTwoItems, 'line_total'), gift_card_amount: 0, physical_amount: sum(billTwoItems, 'line_total'), items: billTwoItems }
  const billThree = { id: crypto.randomUUID(), bill_number: 'B0003', created_at: timestamp(3, 13), subtotal: sum(billThreeItems, 'unit_price'), total_discount: 100, net_amount: sum(billThreeItems, 'line_total') - 100, gift_card_amount: 0, physical_amount: sum(billThreeItems, 'line_total') - 100, items: billThreeItems }
  return {
    services,
    bills: [billOne, billTwo, billThree],
    nextBillNumber: 1001,
    nextGiftCardNumber: 102,
    giftCards: [
      {
        id: cardId1,
        card_number: 'V100',
        original_value: 2000,
        remaining_balance: 2000,
        amount_used: 0,
        status: 'active',
        created_at: timestamp(1, 10),
        gift_card_transactions: [
          { id: crypto.randomUUID(), transaction_type: 'issuance', amount: 2000, created_at: timestamp(1, 10) },
        ],
      },
      {
        id: cardId2,
        card_number: 'V101',
        original_value: 5000,
        remaining_balance: 3500,
        amount_used: 1500,
        status: 'active',
        created_at: timestamp(5, 10),
        gift_card_transactions: [
          { id: crypto.randomUUID(), transaction_type: 'issuance', amount: 5000, created_at: timestamp(5, 10) },
        ],
      },
    ],
    profile: { full_name: 'Uhaas Beauty Studio Admin', email: DEMO_EMAIL },
  }
}

function loadDemo() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (value?.services && value?.bills && value?.giftCards) return value
  } catch { /* use a clean demo state */ }
  const value = initialDemo()
  saveDemo(value)
  return value
}

function saveDemo(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function normaliseBill(row) {
  const rawItems = row.items || row.bill_items || []
  return {
    ...row,
    created_at: row.issued_at || row.created_at,
    gift_card_number: row.gift_card_number || row.gift_cards?.card_number || null,
    items: rawItems.map((item) => ({
      ...item,
      discount: Number(item.discount ?? item.discount_amount ?? 0),
      line_total: Number(item.line_total ?? item.final_amount ?? item.final_price ?? 0),
    })),
    net_amount: Number(row.net_amount ?? row.final_amount ?? 0),
    subtotal: Number(row.subtotal ?? row.gross_amount ?? 0),
    total_discount: Number(row.total_discount ?? row.discount_amount ?? 0),
    physical_amount: Number(row.physical_amount ?? 0),
    gift_card_amount: Number(row.gift_card_amount ?? 0),
  }
}

function normaliseService(row) {
  return { ...row, default_price: Number(row.default_price), is_active: Boolean(row.is_active) }
}

function normaliseCard(row) {
  return {
    ...row,
    original_value: Number(row.original_value),
    remaining_balance: Number(row.remaining_balance),
    amount_used: Number(row.amount_used ?? (Number(row.original_value) - Number(row.remaining_balance))),
  }
}

async function remoteData(userId) {
  const [servicesResult, billsResult, cardsResult, profileResult] = await Promise.all([
    supabase.from('services').select('*').order('service_code'),
    supabase.from('bills').select('*, bill_items(*), gift_cards(card_number)').order('created_at', { ascending: false }),
    supabase.from('gift_cards').select('*, gift_card_transactions(*)').order('created_at', { ascending: false }),
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
  ])
  const error = [servicesResult, billsResult, cardsResult, profileResult].find((result) => result.error)?.error
  if (error) throw error
  if (!profileResult.data) throw new Error('Your account profile could not be loaded. Please contact an administrator.')
  if (profileResult.data.role !== 'admin') {
    throw new Error('This account does not have administrator access. Ask an administrator to grant access before using billing.')
  }
  return {
    services: servicesResult.data.map(normaliseService),
    bills: billsResult.data.map(normaliseBill),
    giftCards: cardsResult.data.map(normaliseCard),
    profile: profileResult.data,
  }
}

function isDemoSession() {
  if (!isSupabaseConfigured) return true
  try {
    return sessionStorage.getItem('glamour-touch-demo') === 'yes'
  } catch (error) {
    console.error('Could not determine the active app mode.', error)
    return false
  }
}

async function requireSupabaseSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (!data?.session?.user) throw new Error('Your session has expired. Sign in again to continue.')
  return data.session
}

export const dataApi = {
  isDemo: !isSupabaseConfigured,
  demoEmail: DEMO_EMAIL,
  async getData() {
    if (isDemoSession()) return loadDemo()
    const session = await requireSupabaseSession()
    return remoteData(session.user.id)
  },
  async saveService(values, id) {
    const payload = {
      service_code: values.service_code?.trim() || `S${String(Date.now()).slice(-6)}`,
      name: values.name.trim(),
      default_price: Number(values.default_price),
      category: values.category?.trim() || 'General',
      is_active: values.is_active !== false,
    }
    if (!payload.name || !Number.isFinite(payload.default_price) || payload.default_price < 0) {
      throw new Error('Enter a service name and a valid price of zero or more.')
    }
    if (!isDemoSession()) {
      await requireSupabaseSession()
      const result = id
        ? await supabase.from('services').update(payload).eq('id', id).select().single()
        : await supabase.from('services').insert(payload).select().single()
      if (result.error) throw result.error
      if (!result.data) throw new Error('The service was not saved.')
      return normaliseService(result.data)
    }
    const data = loadDemo()
    if (id) {
      const index = data.services.findIndex((service) => service.id === id)
      if (index < 0) throw new Error('The service no longer exists. Refresh and try again.')
      data.services[index] = { ...data.services[index], ...payload }
      saveDemo(data)
      return data.services[index]
    }
    const service = { id: crypto.randomUUID(), ...payload, service_code: payload.service_code || `S${String(data.services.length + 1).padStart(3, '0')}` }
    data.services.push(service)
    saveDemo(data)
    return service
  },
  async deactivateService(id, isActive) {
    if (!isDemoSession()) {
      await requireSupabaseSession()
      const { data, error } = await supabase.from('services')
        .update({ is_active: isActive })
        .eq('id', id)
        .select('id')
        .single()
      if (error) throw error
      if (!data) throw new Error('The service status was not updated.')
      return
    }
    const data = loadDemo()
    const service = data.services.find((item) => item.id === id)
    if (!service) throw new Error('The service no longer exists. Refresh and try again.')
    service.is_active = isActive
    saveDemo(data)
  },
  async createGiftCard(amount) {
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) throw new Error('Enter a gift card amount greater than zero.')
    if (!isDemoSession()) {
      await requireSupabaseSession()
      const { data, error } = await supabase.rpc('create_gift_card', { p_original_value: value })
      if (error) throw error
      if (!data) throw new Error('The gift card was not created.')
      return normaliseCard(data)
    }
    const data = loadDemo()
    const nextGiftCardNumber = Number.isSafeInteger(data.nextGiftCardNumber) && data.nextGiftCardNumber >= 100
      ? data.nextGiftCardNumber
      : Math.max(
          99,
          ...data.giftCards.map((card) => {
            const match = /^V(\d+)$/i.exec(card.card_number || '')
            return match ? Number(match[1]) : 0
          }),
        ) + 1
    const card = {
      id: crypto.randomUUID(),
      card_number: `V${nextGiftCardNumber}`,
      original_value: value,
      remaining_balance: value,
      amount_used: 0,
      status: 'active',
      created_at: new Date().toISOString(),
      gift_card_transactions: [],
    }
    data.nextGiftCardNumber = nextGiftCardNumber + 1
    data.giftCards.unshift(card)
    saveDemo(data)
    return card
  },
  async saveBill({ items, giftCardNumber }) {
    if (!Array.isArray(items) || !items.length) throw new Error('Add at least one service before saving the bill.')
    if (!isDemoSession()) {
      await requireSupabaseSession()
      const payloadItems = items.map((item) => ({
        service_id: item.service_id || null,
        service_name: item.name || item.service_name,
        unit_price: Number(item.unit_price),
        discount_amount: Number(item.discount || item.discount_amount || 0),
      }))
      const { data, error } = await supabase.rpc('create_bill', {
        p_items: payloadItems,
        p_gift_card_number: giftCardNumber?.trim() || null,
      })
      if (error) throw error
      if (!data?.id) throw new Error('The bill was not saved.')
      const { data: savedBill, error: savedBillError } = await supabase
        .from('bills')
        .select('*, bill_items(*), gift_cards(card_number)')
        .eq('id', data.id)
        .single()
      if (savedBillError) throw savedBillError
      if (!savedBill) throw new Error('The bill was saved but could not be loaded.')
      return normaliseBill(savedBill)
    }
    const data = loadDemo()
    const card = giftCardNumber ? data.giftCards.find((entry) => entry.card_number.toLowerCase() === giftCardNumber.toLowerCase()) : null
    if (giftCardNumber && (!card || card.status !== 'active' || card.remaining_balance <= 0)) throw new Error('This gift card is not active or has no remaining balance.')
    const totals = calculateBill(items, card?.remaining_balance || 0)
    if (!totals.lines.length) throw new Error('Add at least one service before saving the bill.')
    const nextBillNumber = Number.isSafeInteger(data.nextBillNumber) && data.nextBillNumber >= 1001
      ? data.nextBillNumber
      : Math.max(
          1000,
          ...data.bills.map((bill) => {
            const match = /^B(\d+)$/.exec(bill.bill_number || '')
            return match ? Number(match[1]) : 0
          }),
        ) + 1
    const bill = {
      id: crypto.randomUUID(),
      bill_number: `B${String(nextBillNumber).padStart(4, '0')}`,
      created_at: new Date().toISOString(),
      subtotal: totals.subtotal,
      total_discount: totals.totalDiscount,
      net_amount: totals.netAmount,
      gift_card_amount: totals.giftCardAmount,
      physical_amount: totals.physicalAmount,
      gift_card_number: card?.card_number || null,
      items: totals.lines.map((line) => ({ id: crypto.randomUUID(), service_id: line.service_id || null, service_name: line.name || line.service_name, unit_price: line.unit_price, discount: line.discount, line_total: line.line_total })),
    }
    data.nextBillNumber = nextBillNumber + 1
    if (card && totals.giftCardAmount > 0) {
      card.remaining_balance = Number((card.remaining_balance - totals.giftCardAmount).toFixed(2))
      card.amount_used = Number((card.original_value - card.remaining_balance).toFixed(2))
      card.status = card.remaining_balance === 0 ? 'used' : 'active'
      card.gift_card_transactions.unshift({ id: crypto.randomUUID(), transaction_type: 'redemption', amount: totals.giftCardAmount, bill_id: bill.id, created_at: bill.created_at })
    }
    data.bills.unshift(bill)
    saveDemo(data)
    return bill
  },
  async deleteBill(billId) {
    if (!isDemoSession()) {
      await requireSupabaseSession()
      const { error } = await supabase.rpc('delete_bill', { p_bill_id: billId })
      if (error) throw error
      return
    }
    const data = loadDemo()
    const billIndex = data.bills.findIndex((bill) => bill.id === billId)
    if (billIndex < 0) throw new Error('The bill no longer exists. Refresh and try again.')
    const bill = data.bills[billIndex]
    if (bill.gift_card_number && Number(bill.gift_card_amount) > 0) {
      const card = data.giftCards.find((c) => c.card_number.toLowerCase() === bill.gift_card_number.toLowerCase())
      if (!card) throw new Error('The gift card for this bill was not found. The bill was not deleted.')
      card.remaining_balance = Number((Number(card.remaining_balance) + Number(bill.gift_card_amount)).toFixed(2))
      if (card.remaining_balance > Number(card.original_value)) {
        throw new Error('The gift card balance cannot be restored safely. The bill was not deleted.')
      }
      card.amount_used = Math.max(0, Number((Number(card.original_value) - Number(card.remaining_balance)).toFixed(2)))
      card.status = 'active'
      card.gift_card_transactions.unshift({
        id: crypto.randomUUID(),
        transaction_type: 'refund',
        amount: Number(bill.gift_card_amount),
        created_at: new Date().toISOString(),
        notes: `Restored from deleted bill ${bill.bill_number}`,
      })
    }
    data.bills.splice(billIndex, 1)
    saveDemo(data)
  },
  async findGiftCard(number) {
    if (!number?.trim()) return null
    if (!isDemoSession()) {
      await requireSupabaseSession()
      const { data, error } = await supabase.from('gift_cards')
        .select('*')
        .ilike('card_number', number.trim())
        .maybeSingle()
      if (error) throw error
      return data ? normaliseCard(data) : null
    }
    return loadDemo().giftCards.find((card) => card.card_number.toLowerCase() === number.trim().toLowerCase()) || null
  },
  async updateProfile(values) {
    if (isDemoSession()) {
      const data = loadDemo()
      // Demo mode is deliberately not authentication storage. Never persist
      // a password (or its confirmation) in browser storage.
      data.profile = { ...data.profile, full_name: values.full_name }
      saveDemo(data)
      return data.profile
    }
    const session = await requireSupabaseSession()
    const { data: authData, error: authError } = await supabase.auth.updateUser({
      data: { full_name: values.full_name },
      ...(values.password ? { password: values.password } : {}),
    })
    if (authError) throw authError
    const { data, error } = await supabase.from('profiles')
      .update({ full_name: values.full_name })
      .eq('id', authData.user?.id || session.user.id)
      .select()
      .single()
    if (error) throw error
    return data
  },
  async resetDemo() {
    localStorage.removeItem(STORAGE_KEY)
    return loadDemo()
  },
}
