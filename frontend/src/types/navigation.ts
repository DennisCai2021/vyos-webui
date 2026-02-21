/** Navigation types */

export interface NavItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  path?: string;
  children?: NavItem[];
  badge?: number | string;
  disabled?: boolean;
  category?: string;
}

export interface BreadcrumbItem {
  title: string;
  path?: string;
}

export interface UserMenu {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
}
