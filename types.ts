export interface Organization {
  id: string;
  name: string;
  adminEmail?: string;
  userCount?: number;
  itemCount?: number;
  iaScans30d?: number;
  transactions30d?: number;
  usagePlan?: UsagePlanSeed;
}

export enum UserRole {
    SUPER_ADMIN = 'SUPER_ADMIN',
    ORG_ADMIN = 'ORG_ADMIN',
    WAREHOUSE_MANAGER = 'WAREHOUSE_MANAGER',
    OPERATOR = 'OPERATOR',
}

export interface User {
    id: string; // Corresponds to Firebase Auth UID
    email: string;
    organizationId: string;
    role: UserRole;
    displayName?: string;
}

export interface Invitation {
    id: string; // Corresponds to the invitation document ID (email)
    email: string;
    organizationId: string;
    role: UserRole;
    isInvitation: true;
}

export type UserOrInvitation = User | Invitation;

export enum TransactionType {
  INCOME = 'INCOME',
  OUTCOME = 'OUTCOME',
}

export enum DocumentType {
  INCOME = 'INCOME',
  OUTCOME = 'OUTCOME',
  CONTROL = 'CONTROL',
}

export enum ItemType {
  CHAPA = 'CHAPA',
  MODULO = 'MODULO',
}

export enum ItemSize {
    PEQUENO = 'Pequeño',
    MEDIANO = 'Mediano',
    GRANDE = 'Grande',
}

export enum PartnerType {
    SUPPLIER = 'SUPPLIER',
    CUSTOMER = 'CUSTOMER',
}

export interface Partner {
    id: string;
    organizationId: string;
    name: string;
    isCustomer?: boolean;
    isSupplier?: boolean;
}

export interface Item {
  id: string;
  organizationId: string;
  name: string;
  type: ItemType;
  cost?: number;
  size?: ItemSize;
  weight?: number; // in kg
}

export interface Location {
    id: string;
    organizationId: string;
    name: string;
}

export interface Transaction {
  id:string;
  organizationId: string;
  itemId: string;
  quantity: number;
  type: TransactionType;
  imageUrl?: string;
  documentName?: string;
  createdAt: string;
  partnerId?: string; // NEW: Replaces free-text destination
  destination?: string; // OLD: For backwards compatibility
  locationId?: string;
}

export interface ControlRecord {
    id: string;
    organizationId: string;
    documentImageUrl?: string; 
    deliveryDate: string;
    destination: string;
    models: string;
    quantity: number;
    uploadedAt: string;
    locationId?: string;
}

export interface ScannedItem {
    itemName: string;
    quantity: number;
    itemType: ItemType;
    cost?: number;
    size?: ItemSize;
    weight?: number;
}

export interface ScannedTransactionData {
    items: ScannedItem[];
    // This is now interpreted as a partner name, not a final destination field
    destination: string | null; 
}

export interface ScannedControlSheetData {
    deliveryDate: string;
    destination?: string;
    model: string;
    quantity: number;
}

export interface AnalyticsData {
    executiveSummary: string;
    totalStock: number;
    kpiTrends: {
        totalStock: {
            change: number;
            direction: 'up' | 'down' | 'steady';
        };
        stockValue: {
            change: number;
            direction: 'up' | 'down' | 'steady';
        };
        daysOnHand: {
            change: number;
            direction: 'up' | 'down' | 'steady';
        };
    };
    totalValue: number;
    avgItemValue: number;
    monthlyGrowth: { month: string, value: number }[];
    inventoryTurnover: number;
    daysOnHand: number;
    lowStockItems: { id: string; name: string; stock: number; type: ItemType }[];
    reorderPoints: { name: string; reorderPoint: number; currentStock: number; }[];
    demandForecast: { total: number };
    productPerformance: {
        criticalMaterials: string[];
        strategicAccumulation: string[];
        opportunities: string[];
        lowRotation: string[];
    };
    stockFlow: { date: string; income: number; outcome: number }[];
    topDestinationsByVolume: { destination: string; quantity: number }[];
    stockByType: { type: ItemType; quantity: number; value: number }[];
    totalKitsSold: number;
    monthlyKitsData?: { month: string; kits: number }[];
    logisticsSuggestions: { itemName: string; reason: string; rotation: number; size?: ItemSize, weight?: number }[];
}

export interface GlobalStats {
    totalOrganizations: number;
    totalUsers: number;
    totalItems: number;
    scansLast30Days: number;
}

export interface DailyUsage {
    date: string;
    count: number;
}

export interface UsageCounters {
    documentScans: number;
    assistantSessions: number;
}

export interface UsagePlanSeed {
    planName?: string;
    monthlyQuota?: number;
    dailyQuota?: number;
    perMinuteQuota?: number;
    resetsOn?: string;
}

export interface UsageLimitsState {
    organizationId: string;
    planName: string;
    monthlyQuota: number;
    dailyQuota?: number;
    perMinuteQuota?: number;
    used: number;
    remaining: number;
    resetsOn: string;
    degradeMode: boolean;
    degradeReason?: string;
    lastUpdated: string;
    counters: UsageCounters;
    upgradeRequestedAt?: string;
}
