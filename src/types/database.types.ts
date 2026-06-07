/* eslint-disable @typescript-eslint/no-explicit-any */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type GenericTable = {
  Row: any;
  Insert: any;
  Update: any;
  Relationships: any[];
};

type GenericFunction = {
  Args: { [key: string]: any };
  Returns: any;
};

export type Database = {
  public: {
    Tables: Record<string, GenericTable>;
    Views: Record<string, GenericTable>;
    Functions: Record<string, GenericFunction>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
