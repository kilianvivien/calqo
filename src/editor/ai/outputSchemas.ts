import type { JsonOutputSchema } from './completion';

/** JSON Schemas handed to providers that can constrain their output. They are
 * deliberately looser than the Zod project contract: models fill the shape,
 * `normalizeTemplateDocument` + `safeImportProject` enforce the real rules. */

type Schema = Record<string, unknown>;

const STRING: Schema = { type: 'string' };
const NUMBER: Schema = { type: 'number' };

function object(
  properties: Record<string, Schema>,
  required: string[] = [],
): Schema {
  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
  };
}

function array(items: Schema): Schema {
  return { type: 'array', items };
}

function oneOf(values: string[]): Schema {
  return { type: 'string', enum: values };
}

const SHADOW = object(
  {
    color: STRING,
    blur: NUMBER,
    offsetX: NUMBER,
    offsetY: NUMBER,
    opacity: NUMBER,
  },
  ['color', 'blur', 'offsetX', 'offsetY'],
);

const FILL = object(
  {
    type: oneOf(['solid', 'linear', 'radial']),
    color: STRING,
    angle: NUMBER,
    stops: array(
      object({ offset: NUMBER, color: STRING }, ['offset', 'color']),
    ),
  },
  ['type'],
);

const TEXT_STYLE = object({
  fontFamily: STRING,
  fontSize: NUMBER,
  fontWeight: NUMBER,
  fontStyle: oneOf(['normal', 'italic']),
  color: STRING,
  align: oneOf(['left', 'center', 'right']),
  verticalAlign: oneOf(['top', 'middle', 'bottom']),
  lineHeight: NUMBER,
  letterSpacing: NUMBER,
});

/** One flat object covering every layer kind; kind-specific fields are simply
 * omitted where they do not apply. Groups nest one level of children. */
function layerSchema(allowChildren: boolean): Schema {
  return object(
    {
      type: oneOf(
        allowChildren
          ? ['text', 'list', 'shape', 'group']
          : ['text', 'list', 'shape'],
      ),
      name: STRING,
      x: NUMBER,
      y: NUMBER,
      w: NUMBER,
      h: NUMBER,
      rotation: NUMBER,
      opacity: NUMBER,
      text: STRING,
      items: array(STRING),
      style: TEXT_STYLE,
      marker: object({
        kind: oneOf(['bullet', 'dash', 'arrow', 'none', 'character']),
        color: STRING,
      }),
      markerGap: NUMBER,
      shape: oneOf(['rect', 'ellipse', 'line']),
      fill: FILL,
      stroke: object({ color: STRING, width: NUMBER, look: STRING }, [
        'color',
        'width',
      ]),
      cornerRadius: NUMBER,
      effects: object({ shadow: SHADOW }),
      sticker: object({ color: STRING, width: NUMBER }),
      ...(allowChildren ? { children: array(layerSchema(false)) } : {}),
    },
    ['type', 'name', 'x', 'y', 'w', 'h'],
  );
}

export const TEMPLATE_OUTPUT_SCHEMA: JsonOutputSchema = {
  name: 'calqo_template',
  schema: object(
    {
      name: STRING,
      palette: array(STRING),
      artboards: array(
        object(
          {
            name: STRING,
            preset: STRING,
            width: NUMBER,
            height: NUMBER,
            background: FILL,
            layers: array(layerSchema(true)),
          },
          ['name', 'width', 'height', 'background', 'layers'],
        ),
      ),
    },
    ['name', 'artboards'],
  ),
};

export const TRANSLATION_OUTPUT_SCHEMA: JsonOutputSchema = {
  name: 'calqo_translation',
  schema: object(
    {
      items: array(
        object({ layerId: STRING, translatedText: STRING }, [
          'layerId',
          'translatedText',
        ]),
      ),
    },
    ['items'],
  ),
};

export const COPY_OUTPUT_SCHEMA: JsonOutputSchema = {
  name: 'calqo_copy',
  schema: object({ text: STRING }, ['text']),
};

/** Gemini's `responseSchema` is an OpenAPI subset with upper-case type names. */
export function toGeminiSchema(schema: Schema): Schema {
  const out: Schema = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'type' && typeof value === 'string') {
      out.type = value.toUpperCase();
    } else if (key === 'properties' && value && typeof value === 'object') {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, Schema>).map(([name, child]) => [
          name,
          toGeminiSchema(child),
        ]),
      );
    } else if (key === 'items' && value && typeof value === 'object') {
      out.items = toGeminiSchema(value as Schema);
    } else {
      out[key] = value;
    }
  }
  return out;
}
