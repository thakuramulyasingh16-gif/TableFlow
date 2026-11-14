export type Locale = 'en' | 'hi';

export interface Translations {
  // Navigation & Header
  brandTagline: string;
  table: string;
  pin: string;
  callWaiter: string;
  waiterCalled: string;
  callingWaiter: string;
  viewBill: string;
  cart: string;

  // Search & Filters
  searchPlaceholder: string;
  vegOnly: string;
  allCategories: string;

  // Dish Card
  add: string;
  added: string;
  soldOut: string;
  customisable: string;
  selectVariant: string;
  spice: string;
  noSpice: string;
  mild: string;
  medium: string;
  hot: string;
  extraHot: string;

  // Cart & Ordering
  yourCart: string;
  cartEmpty: string;
  cartEmptyPrompt: string;
  specialInstructionsPlaceholder: string;
  subtotal: string;
  discounts: string;
  taxesGst: string;
  totalPayable: string;
  placeOrder: string;
  placingOrder: string;
  clearCart: string;

  // Live Order Status
  liveOrders: string;
  noActiveOrders: string;
  orderNumber: string;
  statusReceived: string;
  statusConfirmed: string;
  statusPreparing: string;
  statusReady: string;
  statusServed: string;

  // Bill & Payment
  billSummary: string;
  paidAmount: string;
  remainingAmount: string;
  requestBill: string;
  billRequestedBadge: string;
  payBill: string;
  splitBill: string;
  viewGstInvoice: string;
  billPaidSuccess: string;

  // Feedback & Review
  rateExperience: string;
  reviewPlaceholder: string;
  submitFeedback: string;
  feedbackThanks: string;

  // Join PIN Modal
  tablePinRequired: string;
  enterPinPrompt: string;
  joinSession: string;
  verifyingPin: string;
}

export const DICTIONARIES: Record<Locale, Translations> = {
  en: {
    brandTagline: 'Scan · Order · Enjoy',
    table: 'Table',
    pin: 'PIN',
    callWaiter: 'Call Waiter',
    waiterCalled: 'Waiter Called',
    callingWaiter: 'Calling Waiter...',
    viewBill: 'View Bill',
    cart: 'Cart',

    searchPlaceholder: 'Search dishes, drinks, desserts...',
    vegOnly: 'Veg Only',
    allCategories: 'All',

    add: 'Add',
    added: 'Added',
    soldOut: 'Sold Out',
    customisable: 'Customisable',
    selectVariant: 'Select option',
    spice: 'Spice',
    noSpice: 'No spice',
    mild: 'Mild',
    medium: 'Medium',
    hot: 'Hot',
    extraHot: 'Extra hot',

    yourCart: 'Your Cart',
    cartEmpty: 'Your cart is empty',
    cartEmptyPrompt: 'Browse the menu and add items to your dining order.',
    specialInstructionsPlaceholder: 'Special instructions (e.g. less spicy, no onion / garlic)...',
    subtotal: 'Subtotal',
    discounts: 'Discounts & Offers',
    taxesGst: 'Taxes (CGST + SGST 5%)',
    totalPayable: 'Total Payable',
    placeOrder: 'Send Order to Kitchen',
    placingOrder: 'Placing Order...',
    clearCart: 'Clear',

    liveOrders: 'Live Table Orders',
    noActiveOrders: 'No active orders placed yet.',
    orderNumber: 'Order',
    statusReceived: 'Received',
    statusConfirmed: 'Confirmed',
    statusPreparing: 'Preparing',
    statusReady: 'Ready',
    statusServed: 'Served',

    billSummary: 'Bill & Receipt',
    paidAmount: 'Paid',
    remainingAmount: 'Remaining',
    requestBill: 'Request Bill',
    billRequestedBadge: 'Bill Requested',
    payBill: 'Pay Bill Now',
    splitBill: 'Split Bill',
    viewGstInvoice: 'View & Print GST Tax Invoice',
    billPaidSuccess: 'Your bill has been settled. Thank you for dining with us!',

    rateExperience: 'Rate your dining experience',
    reviewPlaceholder: 'Share what you loved or how we can improve...',
    submitFeedback: 'Submit Review',
    feedbackThanks: 'Thank you for your valuable feedback!',

    tablePinRequired: 'Table PIN Required',
    enterPinPrompt: 'Enter the 4-digit PIN displayed on your table partner’s screen or ask your waiter.',
    joinSession: 'Join Table Session',
    verifyingPin: 'Verifying PIN...',
  },
  hi: {
    brandTagline: 'स्कैन करें · ऑर्डर करें · आनंद लें',
    table: 'टेबल',
    pin: 'पिन',
    callWaiter: 'वेटर बुलाएँ',
    waiterCalled: 'वेटर को सूचित किया गया',
    callingWaiter: 'वेटर को बुलाया जा रहा है...',
    viewBill: 'बिल देखें',
    cart: 'कार्ट',

    searchPlaceholder: 'व्यंजन, पेय, या मिष्ठान खोजें...',
    vegOnly: 'केवल शाकाहारी',
    allCategories: 'सभी',

    add: 'जोड़ें',
    added: 'जोड़ा गया',
    soldOut: 'समाप्त (उपलब्ध नहीं)',
    customisable: 'विकल्प उपलब्ध',
    selectVariant: 'विकल्प चुनें',
    spice: 'तीखापन',
    noSpice: 'बिना मिर्च',
    mild: 'हल्का तीखा',
    medium: 'मध्यम तीखा',
    hot: 'तीखा',
    extraHot: 'अत्यधिक तीखा',

    yourCart: 'आपकी कार्ट',
    cartEmpty: 'आपकी कार्ट अभी खाली है',
    cartEmptyPrompt: 'मेनू से अपनी पसंद के स्वादिष्ट व्यंजन जोड़ें।',
    specialInstructionsPlaceholder: 'विशेष निर्देश (जैसे कम मिर्च, बिना प्याज/लहसुन)...',
    subtotal: 'उप-योग',
    discounts: 'छूट एवं ऑफर्स',
    taxesGst: 'जीएसटी कर (CGST + SGST 5%)',
    totalPayable: 'कुल देय राशि',
    placeOrder: 'रसोई को ऑर्डर भेजें',
    placingOrder: 'ऑर्डर भेजा जा रहा है...',
    clearCart: 'खाली करें',

    liveOrders: 'टेबल के वर्तमान ऑर्डर्स',
    noActiveOrders: 'अभी तक कोई ऑर्डर नहीं भेजा गया है।',
    orderNumber: 'ऑर्डर #',
    statusReceived: 'प्राप्त हुआ',
    statusConfirmed: 'स्वीकृत',
    statusPreparing: 'तैयार हो रहा है',
    statusReady: 'परोसने को तैयार',
    statusServed: 'परोसा गया',

    billSummary: 'बिल एवं रसीद',
    paidAmount: 'भुगतान किया गया',
    remainingAmount: 'शेष राशि',
    requestBill: 'बिल का अनुरोध करें',
    billRequestedBadge: 'बिल मांगा गया',
    payBill: 'अभी बिल भरें',
    splitBill: 'बिल बाँटें',
    viewGstInvoice: 'जीएसटी टैक्स इनवॉइस देखें और प्रिंट करें',
    billPaidSuccess: 'आपका बिल पूर्ण रूप से चुकता हो गया है। भोजन का आनंद लेने के लिए धन्यवाद!',

    rateExperience: 'अपने भोजन के अनुभव को रेट करें',
    reviewPlaceholder: 'आपको क्या अच्छा लगा या हम कैसे सुधार सकते हैं, साझा करें...',
    submitFeedback: 'प्रतिक्रिया भेजें',
    feedbackThanks: 'आपकी बहुमूल्य प्रतिक्रिया के लिए धन्यवाद!',

    tablePinRequired: 'टेबल पिन आवश्यक है',
    enterPinPrompt: 'अपने साथी के मोबाइल स्क्रीन पर दिख रहा 4-अंकों का पिन दर्ज करें या वेटर से पूछें।',
    joinSession: 'टेबल सेशन में शामिल हों',
    verifyingPin: 'पिन सत्यापित किया जा रहा है...',
  },
};

export function getTranslations(locale: Locale): Translations {
  return DICTIONARIES[locale] || DICTIONARIES.en;
}
