import { clsx, type ClassValue } from '@nberlette/clsx'
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
