export type BookingStatus = "booked" | "confirmed" | "done" | "cancelled" | "no_show";

export type MyBooking = {
  id: string;
  startUtcISO: string;
  endUtcISO: string;
  status: BookingStatus;
  serviceName: string;
  staffName: string;
};

export type MyBookingsData = {
  tz: string;
  bookings: MyBooking[];
};
