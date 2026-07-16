import { create } from 'zustand';
import { getPublicSocket, getStaffSocket, disconnectSockets } from '../services/socket';
import { useCatalogStore } from './useCatalogStore';
import { useOrdersStore } from './useOrdersStore';

interface SocketState {
  publicConnected: boolean;
  staffConnected: boolean;
  connectPublic: () => void;
  connectStaff: () => void;
  disconnectAll: () => void;
}

export const useSocketStore = create<SocketState>((set) => ({
  publicConnected: false,
  staffConnected: false,

  connectPublic: () => {
    const socket = getPublicSocket();
    socket.off('connect').on('connect', () => set({ publicConnected: true }));
    socket.off('disconnect').on('disconnect', () => set({ publicConnected: false }));
    socket.off('system:public_config').on('system:public_config', (data: any) => { useCatalogStore.getState().updateConfig(data); });
    socket.off('menu:availability_changed').on('menu:availability_changed', (data: { menuItemId: number; available: boolean }) => { useCatalogStore.getState().updateMenuItemAvailability(data.menuItemId, data.available); });
  },

  connectStaff: () => {
    const socket = getStaffSocket();
    socket.off('connect').on('connect', () => set({ staffConnected: true }));
    socket.off('disconnect').on('disconnect', () => set({ staffConnected: false }));
    socket.off('order:created').on('order:created', (order: any) => { useOrdersStore.getState().upsertOrder(order); });
    socket.off('order:status_changed').on('order:status_changed', (data: any) => { if (data.updatedOrder) useOrdersStore.getState().upsertOrder(data.updatedOrder); });
    socket.off('order:confirmed').on('order:confirmed', (data: any) => { if (data.updatedOrder) useOrdersStore.getState().upsertOrder(data.updatedOrder); });
    socket.off('order:accepted').on('order:accepted', (data: any) => { if (data.updatedOrder) useOrdersStore.getState().upsertOrder(data.updatedOrder); });
    socket.off('order:cancelled').on('order:cancelled', (data: any) => { useOrdersStore.getState().patchOrder(data.orderId, { status: 'CANCELADO', requiresStaffConfirmation: false }); });
    socket.off('order:problem_reported').on('order:problem_reported', (data: any) => { useOrdersStore.getState().patchOrder(data.orderId, { problems: data.problems }); });
    socket.off('menu:availability_changed').on('menu:availability_changed', (data: { menuItemId: number; available: boolean }) => { useCatalogStore.getState().updateMenuItemAvailability(data.menuItemId, data.available); });
  },

  disconnectAll: () => {
    disconnectSockets();
    set({ publicConnected: false, staffConnected: false });
  },
}));
