import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Brush,
  Copy,
  Crop,
  FileUp,
  Image as ImageIcon,
  Languages,
  LayoutGrid,
  Layers as LayersIcon,
  Move,
  Palette,
  Plus,
  Redo2,
  Share2,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { assetStorage } from '@/lib/adapters';
import { saveImageAsset } from '@/lib/utils/imageAsset';
import {
  addImportedAssetLayer,
  addLayerToActiveArtboard,
  BRUSH_STYLE_IDS,
  canRedoProject,
  canUndoProject,
  createListLayer,
  createPolygonShapeLayer,
  createShapeLayer,
  createTextLayer,
  deleteSelectedLayers,
  duplicateSelectedLayers,
  replaceLayerAsset,
  redoProject,
  undoProject,
} from '@/editor/commands/projectCommands';
import { findLayerInArtboard } from '@/editor/utils/layers';
import { useActiveArtboard } from '@/lib/state/selectors';
import { useSelectionStore } from '@/lib/state/selectionStore';
import { useHistoryStore } from '@/lib/state/historyStore';
import { useIsLandscape } from '@/lib/hooks/useResponsiveMode';
import { useUiStore } from '@/lib/state/uiStore';
import { isAiEnabled, useAiSettingsStore } from '@/editor/ai/aiSettings';
import type { CalqoLayer, CalqoProject } from '@/lib/schema';
import { GlassIconButton } from '@/components/glass';
import { MobileToolbar, type MobileToolItem } from '@/components/mobile';
import { MobileTopBar } from './MobileTopBar';
import { MobileStage } from './MobileStage';
import { MobileCropOverlay } from './MobileCropOverlay';
import { TextEditSheet } from './sheets/TextEditSheet';
import { TranslateSheet } from './sheets/TranslateSheet';
import { FillSheet } from './sheets/FillSheet';
import { LayersSheet } from './sheets/LayersSheet';
import { ArrangeSheet } from './sheets/ArrangeSheet';
import { ExportSheet } from './sheets/ExportSheet';
import { ImportExportSheet } from './sheets/ImportExportSheet';
import { MobileSvgSheet } from './sheets/MobileSvgSheet';
import { WorkspaceSheet } from './sheets/WorkspaceSheet';
import { AddSheet, type AddKind } from './sheets/AddSheet';

type Sheet =
  | 'none'
  | 'add'
  | 'text'
  | 'translate'
  | 'color'
  | 'layers'
  | 'arrange'
  | 'workspace'
  | 'files'
  | 'svg'
  | 'export';

interface MobileEditorProps {
  project: CalqoProject;
  onBack: () => void;
}

function measureImage(file: File): Promise<{ width?: number; height?: number }> {
  if (file.type === 'image/svg+xml') return Promise.resolve({});
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
    image.src = url;
  });
}

function isRecolorable(layer: CalqoLayer | null): boolean {
  return (
    layer?.type === 'text' ||
    layer?.type === 'list' ||
    layer?.type === 'shape' ||
    layer?.type === 'image' ||
    layer?.type === 'svg'
  );
}

/** The phone editor surface: top bar, a single-artboard touch canvas, and a
 * contextual toolbar that opens bottom-sheet flows for the quick-edit tasks. */
export function MobileEditor({ project, onBack }: MobileEditorProps) {
  const { t } = useTranslation('editor');
  const artboard = useActiveArtboard();
  const selectedLayerIds = useSelectionStore((s) => s.selectedLayerIds);
  const landscape = useIsLandscape();
  // Re-derive undo availability whenever this project's history changes.
  useHistoryStore((s) => s.histories[project.id]);

  const [sheet, setSheet] = useState<Sheet>('none');
  const [brush, setBrush] = useState(false);
  const brushStyle = useUiStore((s) => s.shapeDefaults.brushStyle);
  const setShapeDefaults = useUiStore((s) => s.setShapeDefaults);
  const [cropLayerId, setCropLayerId] = useState<string | null>(null);
  const replaceTargetRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const insertImageRef = useRef<HTMLInputElement>(null);
  const aiEnabled = useAiSettingsStore((s) => isAiEnabled(s.settings));

  if (!artboard) return null;

  const selectedLayer =
    selectedLayerIds.length === 1
      ? findLayerInArtboard(artboard, selectedLayerIds[0])
      : null;

  const cropLayer = cropLayerId ? findLayerInArtboard(artboard, cropLayerId) : null;

  const openImagePicker = (layerId: string) => {
    replaceTargetRef.current = layerId;
    fileInputRef.current?.click();
  };

  const insert = (kind: AddKind) => {
    setSheet('none');
    const cx = artboard.width / 2;
    const cy = artboard.height / 2;
    if (kind === 'text') {
      addLayerToActiveArtboard(project.id, createTextLayer(project, cx - 180, cy - 48));
      setSheet('text');
      return;
    }
    if (kind === 'list') {
      addLayerToActiveArtboard(project.id, createListLayer(project, cx - 180, cy - 80));
      return;
    }
    if (kind === 'image') {
      insertImageRef.current?.click();
      return;
    }
    if (kind === 'svg') {
      setSheet('svg');
      return;
    }
    if (kind === 'brush') {
      setBrush(true);
      return;
    }
    const w = kind === 'line' ? 360 : 320;
    const h = kind === 'line' ? 2 : 220;
    const layer =
      kind === 'triangle'
        ? createPolygonShapeLayer('triangle', cx - w / 2, cy - h / 2, w, h)
        : createShapeLayer(kind, cx - w / 2, cy - h / 2, w, h);
    addLayerToActiveArtboard(project.id, layer);
  };

  const onInsertAsset = async (
    fileList: FileList | null,
    kind: 'raster' | 'svg',
    input: HTMLInputElement | null,
  ) => {
    const file = fileList?.[0];
    if (input) input.value = '';
    if (!file) return;
    const asset = kind === 'raster'
      ? await saveImageAsset(project.id, file)
      : await (async () => {
          const measured = await measureImage(file);
          return assetStorage.saveAsset(project.id, file, {
            kind,
            name: file.name,
            mimeType: file.type,
            width: measured.width,
            height: measured.height,
          });
        })();
    const w = asset.width ?? 360;
    const h = asset.height ?? 240;
    addImportedAssetLayer(
      project.id,
      asset,
      artboard.width / 2 - w / 2,
      artboard.height / 2 - h / 2,
    );
  };

  const onPickImage = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    const layerId = replaceTargetRef.current;
    replaceTargetRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file || !layerId || !file.type.startsWith('image/')) return;
    const asset = await saveImageAsset(project.id, file);
    replaceLayerAsset(project.id, layerId, asset);
  };

  // Always pinned to the left of the toolbar — the entry point for inserting.
  const addItem: MobileToolItem = {
    id: 'add',
    label: t('mobile.toolbar.add'),
    icon: Plus,
    accent: true,
    onClick: () => setSheet('add'),
  };

  const selectionItems: MobileToolItem[] = selectedLayer
    ? [
        ...(selectedLayer.type === 'text' || selectedLayer.type === 'list'
          ? [
              {
                id: 'text',
                label: t('mobile.toolbar.text'),
                icon: Type,
                accent: true,
                onClick: () => setSheet('text'),
              },
            ]
          : []),
        ...(selectedLayer.type === 'image'
          ? [
              {
                id: 'crop',
                label: t('mobile.toolbar.crop'),
                icon: Crop,
                accent: true,
                onClick: () => setCropLayerId(selectedLayer.id),
              },
              {
                id: 'replace',
                label: t('mobile.toolbar.replace'),
                icon: ImageIcon,
                onClick: () => openImagePicker(selectedLayer.id),
              },
            ]
          : []),
        ...(isRecolorable(selectedLayer)
          ? [
              {
                id: 'color',
                label: t('mobile.toolbar.color'),
                icon: Palette,
                onClick: () => setSheet('color'),
              },
            ]
          : []),
        {
          id: 'arrange',
          label: t('mobile.toolbar.arrange'),
          icon: Move,
          onClick: () => setSheet('arrange'),
        },
        {
          id: 'duplicate',
          label: t('mobile.toolbar.duplicate'),
          icon: Copy,
          onClick: () => duplicateSelectedLayers(project.id),
        },
        {
          id: 'delete',
          label: t('mobile.toolbar.delete'),
          icon: Trash2,
          onClick: () => deleteSelectedLayers(project.id),
        },
        {
          id: 'layers',
          label: t('mobile.toolbar.layers'),
          icon: LayersIcon,
          onClick: () => setSheet('layers'),
        },
        ...(aiEnabled
          ? [
              {
                id: 'translate',
                label: t('mobile.toolbar.translate'),
                icon: Languages,
                onClick: () => setSheet('translate'),
              },
            ]
          : []),
      ]
    : [
        {
          id: 'workspace',
          label: t('mobile.toolbar.workspace'),
          icon: LayoutGrid,
          accent: true,
          onClick: () => setSheet('workspace'),
        },
        {
          id: 'background',
          label: t('mobile.toolbar.background'),
          icon: Palette,
          onClick: () => setSheet('color'),
        },
        {
          id: 'layers',
          label: t('mobile.toolbar.layers'),
          icon: LayersIcon,
          onClick: () => setSheet('layers'),
        },
        ...(aiEnabled
          ? [
              {
                id: 'translate',
                label: t('mobile.toolbar.translate'),
                icon: Languages,
                onClick: () => setSheet('translate'),
              },
            ]
          : []),
        {
          id: 'export',
          label: t('mobile.toolbar.export'),
          icon: Share2,
          onClick: () => setSheet('export'),
        },
      ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <MobileTopBar
        title={project.name}
        subtitle={artboard.name}
        onBack={onBack}
        backLabel={t('mobile.browser.title')}
        actions={
          <>
            <GlassIconButton
              label={t('actions.undo', { ns: 'common' })}
              showTitle={false}
              disabled={!canUndoProject(project.id)}
              onClick={() => undoProject(project.id)}
            >
              <Undo2 size={16} />
            </GlassIconButton>
            <GlassIconButton
              label={t('actions.redo', { ns: 'common' })}
              showTitle={false}
              disabled={!canRedoProject(project.id)}
              onClick={() => redoProject(project.id)}
            >
              <Redo2 size={16} />
            </GlassIconButton>
            <GlassIconButton
              label={t('mobile.files.title')}
              showTitle={false}
              onClick={() => setSheet('files')}
            >
              <FileUp size={16} />
            </GlassIconButton>
          </>
        }
      />

      <div className={landscape ? 'flex min-h-0 flex-1 gap-2' : 'flex min-h-0 flex-1 flex-col gap-2'}>
        <div className="glass relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)]">
          <MobileStage
            project={project}
            artboard={artboard}
            brush={brush}
            onEditText={() => setSheet('text')}
            onCropImage={(layer) => setCropLayerId(layer.id)}
          />
          {brush && (
            <div className="absolute inset-x-0 top-2 flex flex-col items-center gap-2 px-2">
              <button
                type="button"
                onClick={() => setBrush(false)}
                className="glass glass-strong flex items-center gap-2 rounded-full border border-[var(--calqo-divider)] px-4 py-1.5 text-[12.5px] font-medium text-[var(--calqo-accent)] shadow-[0_8px_24px_rgba(0,0,0,0.22)]"
              >
                <Brush size={14} />
                {t('mobile.brush.done')}
              </button>
              <div className="calqo-scroll glass glass-strong flex max-w-full items-center gap-1.5 overflow-x-auto rounded-full border border-[var(--calqo-divider)] px-2 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.22)]">
                {BRUSH_STYLE_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setShapeDefaults({ brushStyle: id })}
                    className={
                      'h-8 shrink-0 rounded-full border px-3 text-[12px] font-medium transition-colors ' +
                      (brushStyle === id
                        ? 'border-[var(--calqo-accent)] bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]'
                        : 'border-[var(--calqo-divider)] text-[var(--calqo-text-2)]')
                    }
                  >
                    {t(`properties.brushStyle_${id}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={landscape ? 'h-full w-[76px] shrink-0' : undefined}>
          <MobileToolbar items={[addItem, ...selectionItems]} vertical={landscape} />
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void onPickImage(event.target.files)}
      />
      <input
        ref={insertImageRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(event) =>
          void onInsertAsset(event.target.files, 'raster', insertImageRef.current)
        }
      />

      <AddSheet
        open={sheet === 'add'}
        onClose={() => setSheet('none')}
        onInsert={insert}
      />
      {selectedLayer && (selectedLayer.type === 'text' || selectedLayer.type === 'list') && (
        <TextEditSheet
          open={sheet === 'text'}
          onClose={() => setSheet('none')}
          project={project}
          layer={selectedLayer}
        />
      )}
      <FillSheet
        open={sheet === 'color'}
        onClose={() => setSheet('none')}
        project={project}
        artboard={artboard}
        layer={selectedLayer}
      />
      {selectedLayer && (
        <ArrangeSheet
          open={sheet === 'arrange'}
          onClose={() => setSheet('none')}
          project={project}
        />
      )}
      <LayersSheet
        open={sheet === 'layers'}
        onClose={() => setSheet('none')}
        project={project}
        artboard={artboard}
      />
      <WorkspaceSheet
        open={sheet === 'workspace'}
        onClose={() => setSheet('none')}
        project={project}
      />
      <ImportExportSheet
        open={sheet === 'files'}
        onClose={() => setSheet('none')}
        project={project}
      />
      <MobileSvgSheet
        open={sheet === 'svg'}
        onClose={() => setSheet('none')}
        project={project}
        artboard={artboard}
      />
      <TranslateSheet
        open={sheet === 'translate'}
        onClose={() => setSheet('none')}
        project={project}
      />
      <ExportSheet
        open={sheet === 'export'}
        onClose={() => setSheet('none')}
        project={project}
        artboard={artboard}
      />

      {cropLayer && cropLayer.type === 'image' && (
        <MobileCropOverlay
          project={project}
          layer={cropLayer}
          onClose={() => setCropLayerId(null)}
        />
      )}
    </div>
  );
}
