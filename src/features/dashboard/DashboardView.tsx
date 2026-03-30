import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  SimpleGrid,
  Text,
  Center,
  Loader,
  Title,
  Stack,
  Button,
  Group,
  ScrollArea
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { WidgetConfig, AppSettings } from '../../types';
import { DashboardWidget } from './DashboardWidget';

const DEFAULT_WIDGETS: Omit<WidgetConfig, 'id'>[] = [
    { title: 'Overall S-Curve', chartType: 'SCurve', granularity: 'monthly', wbsIds: [], userIds: [], milestoneIds: [], tags: [] },
    { title: 'Overall Forecast', chartType: 'EvEtcArea', granularity: 'monthly', wbsIds: [], userIds: [], milestoneIds: [], tags: [] },
];

interface DashboardViewProps {
  planVersionId: number | null;
  dbPath: string | null;
}

export function DashboardView({ planVersionId, dbPath }: DashboardViewProps) {
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const saveWidgetsToSettings = async (newWidgets: WidgetConfig[], path: string) => {
    try {
      const settings = await invoke<AppSettings>('get_settings');
      if (!settings.projectSettings) settings.projectSettings = {};
      if (!settings.projectSettings[path]) settings.projectSettings[path] = {};
      if (!settings.projectSettings[path].dashboard) settings.projectSettings[path].dashboard = {};

      settings.projectSettings[path].dashboard.widgets = newWidgets;
      await invoke('update_settings', { settings: settings });
    } catch (e) {
      console.error("Failed to save dashboard settings", e);
    }
  };

  useEffect(() => {
    const loadSettings = async () => {
      if (!planVersionId || !dbPath) {
        setWidgets([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const settings = await invoke<AppSettings>('get_settings');
        const savedWidgets = settings.projectSettings?.[dbPath]?.dashboard?.widgets;
        if (savedWidgets && Array.isArray(savedWidgets) && savedWidgets.length > 0) {
          setWidgets(savedWidgets);
        } else {
          setWidgets(DEFAULT_WIDGETS.map(w => ({...w, id: crypto.randomUUID()})));
        }
      } catch (e) {
        console.error("Failed to load dashboard settings", e);
        setWidgets(DEFAULT_WIDGETS.map(w => ({...w, id: crypto.randomUUID()})));
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, [planVersionId, dbPath]);

  const addWidget = () => {
    if (!dbPath) return;
    const newWidget: WidgetConfig = {
      id: crypto.randomUUID(),
      title: 'New S-Curve',
      chartType: 'SCurve',
      granularity: 'monthly',
      wbsIds: [],
      userIds: [],
      milestoneIds: [],
      tags: [],
    };
    const newWidgets = [...widgets, newWidget];
    setWidgets(newWidgets);
    saveWidgetsToSettings(newWidgets, dbPath);
  };

  const updateWidget = useCallback((id: string, newConfig: Partial<WidgetConfig>) => {
    if (!dbPath) return;
    setWidgets(current => {
      const next = current.map(w => (w.id === id ? { ...w, ...newConfig } : w));
      saveWidgetsToSettings(next, dbPath);
      return next;
    });
  }, [dbPath]);

  const removeWidget = useCallback((id: string) => {
    if (!dbPath) return;
    setWidgets(current => {
      const next = current.filter(w => w.id !== id);
      saveWidgetsToSettings(next, dbPath);
      return next;
    });
  }, [dbPath]);

  if (loading) {
    return <Center style={{ height: '100%' }}><Loader /></Center>;
  }
  if (!planVersionId) {
    return <Text c="dimmed" ta="center" pt="xl">Please select a project to view the dashboard.</Text>;
  }

  return (
    <ScrollArea h="calc(100vh - 90px)" offsetScrollbars>
      <Stack pr="md" pb="md">
        <Group justify="space-between">
            <Title order={2}>EVM Dashboard</Title>
            <Button onClick={addWidget} leftSection={<IconPlus size={16}/>}>Add Panel</Button>
        </Group>
      
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
            {widgets.map(config => (
                <DashboardWidget
                    key={config.id}
                    config={config}
                    planVersionId={planVersionId}
                    onUpdate={updateWidget}
                    onRemove={removeWidget}
                />
            ))}
        </SimpleGrid>
      </Stack>
    </ScrollArea>
  );
}
