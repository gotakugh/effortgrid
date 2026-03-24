import { useEffect, useState, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Table,
  Badge,
  Button,
  Modal,
  TextInput,
  Select,
  Stack,
  Group,
  Title,
  Text,
  NumberInput,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { useDebouncedCallback, useDisclosure } from '@mantine/hooks';
import { z } from 'zod';
import { WbsElementDetail, WbsElementType } from '../../types';
import { IconPlus, IconSitemap } from '@tabler/icons-react';

// ツリー構造のための新しい型定義
interface TreeNode extends WbsElementDetail {
  children: TreeNode[];
}

interface WbsListViewProps {
  planVersionId: number | null;
}

const addElementSchema = z.object({
  title: z.string().min(1, { message: 'Title is required' }),
  elementType: z.enum(['Project', 'WorkPackage', 'Activity']),
});

// WBSの各行をレンダリングする再帰コンポーネント
function WbsElementRow({
  element,
  level,
  onAddChild,
}: {
  element: TreeNode;
  level: number;
  onAddChild: (parent: WbsElementDetail) => void;
}) {
  const [pv, setPv] = useState(element.estimatedPv ?? '');

  // 1秒間入力がなければDBを更新するデバウンス処理
  const debouncedUpdate = useDebouncedCallback(async (newPvValue: number | null) => {
    try {
      await invoke('update_wbs_element_pv', {
        payload: { id: element.id, estimatedPv: newPvValue },
      });
    } catch (error) {
      console.error('Failed to update PV:', error);
      // エラー通知をユーザーに表示する（オプション）
    }
  }, 1000);

  const handlePvChange = (value: string | number) => {
    setPv(value);
    const numericValue = value === '' ? null : Number(value);
    debouncedUpdate(numericValue);
  };

  const getBadgeColor = (type: WbsElementType) => {
    switch (type) {
      case 'Project':
        return 'blue';
      case 'WorkPackage':
        return 'cyan';
      case 'Activity':
        return 'teal';
      default:
        return 'gray';
    }
  };

  return (
    <>
      <Table.Tr key={element.id}>
        <Table.Td style={{ paddingLeft: `${level * 24 + 12}px` }}>{element.title}</Table.Td>
        <Table.Td>
          <Badge color={getBadgeColor(element.elementType)}>{element.elementType}</Badge>
        </Table.Td>
        <Table.Td>
          {element.elementType === 'Activity' ? (
            <NumberInput
              value={pv}
              onChange={handlePvChange}
              placeholder="Enter PV"
              hideControls
              min={0}
              style={{ width: 100 }}
            />
          ) : (
            <Text c="dimmed" size="sm">
              -
            </Text>
          )}
        </Table.Td>
        <Table.Td>
          <Tooltip label="Add child element">
            <ActionIcon
              variant="subtle"
              onClick={() => onAddChild(element)}
              disabled={element.elementType === 'Activity'}
            >
              <IconSitemap size={16} />
            </ActionIcon>
          </Tooltip>
        </Table.Td>
      </Table.Tr>
      {element.children.map((child) => (
        <WbsElementRow key={child.id} element={child} level={level + 1} onAddChild={onAddChild} />
      ))}
    </>
  );
}

export function WbsListView({ planVersionId }: WbsListViewProps) {
  const [elements, setElements] = useState<WbsElementDetail[]>([]);
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [activeParent, setActiveParent] = useState<WbsElementDetail | null>(null);

  const fetchElements = useCallback(async () => {
    if (!planVersionId) return;
    try {
      const result = await invoke<WbsElementDetail[]>('list_wbs_elements', {
        planVersionId,
      });
      setElements(result);
    } catch (error) {
      console.error('Failed to fetch WBS elements:', error);
    }
  }, [planVersionId]);

  useEffect(() => {
    if (planVersionId) {
      fetchElements();
    } else {
      setElements([]);
    }
  }, [planVersionId, fetchElements]);

  const tree = useMemo(() => {
    const items = [...elements];
    const map: { [key: number]: TreeNode } = {};
    const roots: TreeNode[] = [];

    // wbsElementIdをキーにしたマップを作成
    items.forEach((item) => {
      map[item.wbsElementId] = { ...item, children: [] };
    });

    // 親子関係を構築
    items.forEach((item) => {
      const node = map[item.wbsElementId];
      if (item.parentElementId && map[item.parentElementId]) {
        map[item.parentElementId].children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }, [elements]);

  // UI ガードレール: 親要素のタイプに応じて追加可能な子要素のタイプを制限
  const availableElementTypes = useMemo(() => {
    if (!activeParent || activeParent.elementType === 'Project') {
      return ['WorkPackage', 'Activity'];
    }
    if (activeParent.elementType === 'WorkPackage') {
      return ['WorkPackage', 'Activity'];
    }
    return [];
  }, [activeParent]);

  const form = useForm({
    initialValues: {
      title: '',
      elementType: 'Activity' as WbsElementType,
    },
    validate: zodResolver(addElementSchema),
  });

  const handleOpenAddModal = (parent: WbsElementDetail | null) => {
    setActiveParent(parent);
    form.reset();
    // 親に応じてデフォルトのタイプを設定
    form.setFieldValue(
      'elementType',
      !parent || parent.elementType === 'Project' ? 'WorkPackage' : 'Activity'
    );
    openModal();
  };

  const handleAddElement = async (values: typeof form.values) => {
    if (!planVersionId) return;
    try {
      await invoke('add_wbs_element', {
        payload: {
          planVersionId,
          title: values.title,
          elementType: values.elementType,
          parentElementId: activeParent?.wbsElementId ?? null,
        },
      });
      closeModal();
      fetchElements(); // リストを再取得
    } catch (error) {
      console.error('Failed to add WBS element:', error);
    }
  };

  if (!planVersionId) {
    return (
      <Text c="dimmed" style={{ textAlign: 'center', paddingTop: '2rem' }}>
        Please select a project to see its WBS.
      </Text>
    );
  }

  return (
    <>
      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={activeParent ? `Add child to "${activeParent.title}"` : 'Add Root Element'}
      >
        <form onSubmit={form.onSubmit(handleAddElement)}>
          <Stack>
            <TextInput
              withAsterisk
              label="Title"
              placeholder="e.g., Design UI"
              {...form.getInputProps('title')}
            />
            <Select
              withAsterisk
              label="Element Type"
              data={availableElementTypes}
              {...form.getInputProps('elementType')}
            />
            <Group justify="flex-end" mt="md">
              <Button type="submit">Add Element</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Group justify="space-between" mb="md">
        <Title order={2}>WBS & Estimates</Title>
        <Button onClick={() => handleOpenAddModal(null)} leftSection={<IconPlus size={14} />}>
          Add Root Element
        </Button>
      </Group>

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>WBS Title</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Estimated PV</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {tree.map((node) => (
            <WbsElementRow
              key={node.id}
              element={node}
              level={0}
              onAddChild={handleOpenAddModal}
            />
          ))}
        </Table.Tbody>
      </Table>
    </>
  );
}
