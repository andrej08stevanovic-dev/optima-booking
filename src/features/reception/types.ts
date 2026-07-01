export type ReceptionStaff = { id: string; full_name: string };

export type ReceptionBooking = {
  id: string;
  staffId: string;
  startUtcISO: string;
  endUtcISO: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
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
