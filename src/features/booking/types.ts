export type Category = "kosa" | "nokti";

export type Service = {
  id: string;
  name: string;
  category: Category;
  duration_minutes: number;
  price: number;
};

export type StaffMember = {
  id: string;
  full_name: string;
};
