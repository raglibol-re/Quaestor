import type * as React from 'react';
export type BudgetStatus = 'active' | 'reserved' | 'rejected' | 'frozen';
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'secondary' | 'danger'; size?: 'md' | 'sm' }
export declare function Button(props: ButtonProps): React.ReactElement;
export interface StatusBadgeProps { status: BudgetStatus; children?: React.ReactNode }
export declare function StatusBadge(props: StatusBadgeProps): React.ReactElement;
export interface AmountProps { value: number; unit?: string | null; size?: 'md' | 'lg'; tone?: 'active' | 'reserved' | 'rejected' }
export declare function Amount(props: AmountProps): React.ReactElement;
export interface BudgetMeterProps { limit: number; spent: number; reserved: number; legend?: boolean }
export declare function BudgetMeter(props: BudgetMeterProps): React.ReactElement;
export interface AgentNodeProps { name: string; depth: 1 | 2 | 3 | 4; limit: number; spent: number; reserved: number; status?: BudgetStatus; address?: string; selected?: boolean }
export declare function AgentNode(props: AgentNodeProps): React.ReactElement;
export interface ToolResultRow { label: string; value: number | React.ReactNode; tone?: 'active' | 'reserved' | 'rejected' }
export interface ToolResultProps { title: string; status: BudgetStatus; statusLabel?: string; message?: string; rows?: ToolResultRow[]; meter?: BudgetMeterProps; signature?: string; meta?: string }
export declare function ToolResult(props: ToolResultProps): React.ReactElement;
export declare function Mark(props: { className?: string }): React.ReactElement;
export declare function formatUSDC(n: number): string;
declare global { interface Window { Quaestor: { Button: typeof Button; StatusBadge: typeof StatusBadge; Amount: typeof Amount; BudgetMeter: typeof BudgetMeter; AgentNode: typeof AgentNode; ToolResult: typeof ToolResult; Mark: typeof Mark; formatUSDC: typeof formatUSDC } } }
