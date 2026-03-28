import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { PlanMilestone } from '../types';
import { notifications } from '@mantine/notifications';

export interface MilestonePayload {
    name: string;
    targetDate: string;
}

export function useMilestones(planVersionId: number | null, portfolioId: number | null) {
    const [milestones, setMilestones] = useState<PlanMilestone[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchMilestones = useCallback(async () => {
        if (!planVersionId) return;
        setLoading(true);
        try {
            const result = await invoke<PlanMilestone[]>('list_plan_milestones', { planVersionId });
            setMilestones(result);
        } catch (error) {
            console.error('Failed to fetch milestones:', error);
            notifications.show({ title: 'Error', message: 'Failed to fetch milestones.', color: 'red' });
        } finally {
            setLoading(false);
        }
    }, [planVersionId]);

    const addMilestone = async (payload: MilestonePayload) => {
        if (!planVersionId || !portfolioId) return;
        try {
            await invoke('add_plan_milestone', { payload: { ...payload, planVersionId, portfolioId } });
            await fetchMilestones();
            notifications.show({ title: 'Success', message: 'Milestone added.', color: 'green' });
        } catch (error) {
            console.error('Failed to add milestone:', error);
            notifications.show({ title: 'Error', message: 'Failed to add milestone.', color: 'red' });
        }
    };
    
    const updateMilestone = async (id: number, payload: MilestonePayload) => {
        try {
            await invoke('update_plan_milestone', { payload: { id, ...payload } });
            await fetchMilestones();
            notifications.show({ title: 'Success', message: 'Milestone updated.', color: 'green' });
        } catch (error) {
            console.error('Failed to update milestone:', error);
            notifications.show({ title: 'Error', message: 'Failed to update milestone.', color: 'red' });
        }
    };
    
    const deleteMilestone = async (id: number) => {
        if (!planVersionId) return;
        try {
            await invoke('delete_plan_milestone', { payload: { id, planVersionId } });
            await fetchMilestones();
            notifications.show({ title: 'Success', message: 'Milestone deleted.', color: 'green' });
        } catch (error) {
            console.error('Failed to delete milestone:', error);
            notifications.show({ title: 'Error', message: 'Failed to delete milestone.', color: 'red' });
        }
    };

    return { milestones, loading, fetchMilestones, addMilestone, updateMilestone, deleteMilestone };
}
