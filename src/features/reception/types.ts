export type ReceptionStaff = { id: string; full_name: string };

export type ReceptionBooking = {
  id: string;
  staffId: string;
  serviceId: string;
  startUtcISO: string;
  endUtcISO: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  note: string | null;
};

export type ReceptionTimeOff = {
  id: string;
  staffId: string;
  startUtcISO: string;
  endUtcISO: string;
  reason: string | null;
};

export type DayCalendar = {
  dateStr: string;
  staff: ReceptionStaff[];
  bookings: ReceptionBooking[];
  timeOff: ReceptionTimeOff[];
  gridStartMinutes: number; // minuti od ponoći, Beograd
  gridEndMinutes: number;
};

// Podaci za formu recepcije (kreiranje/izmena). Uključuje SVE radnike (i neaktivne —
// recepcija sme da zakaže i kod trenutno neaktivnog).
export type FormStaff = { id: string; full_name: string; is_active: boolean };
export type FormService = {
  id: string;
  name: string;
  category: string;
  duration_minutes: number;
  price: number;
};
export type ReceptionFormData = {
  staff: FormStaff[];
  services: FormService[];
  links: { staff_id: string; service_id: string }[];
};

export type ReceptionSource = "reception" | "walk_in";
