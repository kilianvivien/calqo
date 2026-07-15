//! JSON-Schema-only mirrors of the webview MCP contract.
//!
//! Runtime payloads remain `serde_json::Value` and are validated by the Zod
//! source of truth in `src/editor/mcp/operationSchemas.ts`. These types exist so
//! `tools/list` describes operation and layer payloads instead of advertising
//! the old unconstrained `operations.items: true` schema.

use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LayerCommon {
    /// Stable handle chosen by the agent; Calqo remaps collisions and returns `idMap`.
    pub id: String,
    pub name: String,
    /// Artboard-pixel position, origin at the top left.
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotation: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visible: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locked: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blend_mode: Option<BlendMode>,
    /// Optional shadow/blur object; see `calqo_get_guide` for advanced effects.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effects: Option<Value>,
    /// Optional editable sticker-outline object.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sticker: Option<Value>,
}

#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum BlendMode {
    Normal,
    Multiply,
    Screen,
    Overlay,
}

#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub enum FillParam {
    Solid {
        color: String,
    },
    Linear {
        angle: f64,
        stops: Vec<GradientStop>,
    },
    Radial {
        stops: Vec<GradientStop>,
    },
    Pattern {
        pattern: PatternKind,
        color: String,
        background: String,
        scale: f64,
        angle: f64,
    },
    Image {
        asset_id: String,
        fit: ImageFit,
    },
}

#[derive(Deserialize, Serialize, JsonSchema)]
pub struct GradientStop {
    /// Position from 0 to 1.
    pub offset: f64,
    pub color: String,
}

#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum PatternKind {
    Dots,
    Grid,
    Hatch,
    CrossHatch,
    Checker,
}

#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct StrokeParam {
    pub color: String,
    pub width: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dash: Option<Vec<f64>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<StrokePattern>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cap: Option<LineCap>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub join: Option<LineJoin>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dash_len: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gap: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub look: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alt_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intensity: Option<f64>,
}

#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum StrokePattern {
    Solid,
    Dashed,
    Dotted,
}

#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum LineCap {
    Butt,
    Round,
    Square,
}

#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum LineJoin {
    Miter,
    Round,
    Bevel,
}

#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TextStyleParam {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f64>,
    /// Number (for example 700) or a CSS weight string.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_weight: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_style: Option<FontStyle>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_decoration: Option<TextDecoration>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub align: Option<TextAlign>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vertical_align: Option<VerticalAlign>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_height: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub letter_spacing: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke: Option<StrokeParam>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shadow: Option<Value>,
}

#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum FontStyle {
    Normal,
    Italic,
}

#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum TextDecoration {
    None,
    Underline,
}

#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum TextAlign {
    Left,
    Center,
    Right,
    Justify,
}

#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum VerticalAlign {
    Top,
    Middle,
    Bottom,
}

#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub enum LayerParam {
    Text {
        #[serde(flatten)]
        common: LayerCommon,
        /// Copy keyed by locale, for example `{ "en": "Launch day" }`.
        text: BTreeMap<String, String>,
        style: TextStyleParam,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        auto_fit: Option<bool>,
    },
    Shape {
        #[serde(flatten)]
        common: LayerCommon,
        shape: ShapeKind,
        /// Optional for line/arrow/freehand; Calqo supplies a transparent fill.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        fill: Option<FillParam>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        stroke: Option<StrokeParam>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        corner_radius: Option<f64>,
        /// Coordinates relative to the layer box, all within 0..w / 0..h.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        points: Option<Vec<f64>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        tension: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        arrow: Option<Value>,
    },
    Image {
        #[serde(flatten)]
        common: LayerCommon,
        asset_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        fit: Option<ImageFit>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        crop: Option<Value>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        focal_point: Option<Value>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        mask: Option<Value>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        filters: Option<Value>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        frame: Option<Value>,
    },
    Svg {
        #[serde(flatten)]
        common: LayerCommon,
        asset_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        color: Option<String>,
    },
    List {
        #[serde(flatten)]
        common: LayerCommon,
        items: Vec<ListItemParam>,
        marker: ListMarkerParam,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        marker_gap: Option<f64>,
        style: TextStyleParam,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        auto_fit: Option<bool>,
    },
    Group {
        #[serde(flatten)]
        common: LayerCommon,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        expanded: Option<bool>,
        children: Vec<LayerParam>,
    },
}

#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ShapeKind {
    Rect,
    Ellipse,
    Line,
    Polygon,
    Arrow,
    Freehand,
}

#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ImageFit {
    Cover,
    Contain,
    Stretch,
}

#[derive(Deserialize, Serialize, JsonSchema)]
pub struct ListItemParam {
    pub id: String,
    pub text: BTreeMap<String, String>,
}

#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ListMarkerParam {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<MarkerKind>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub character: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<f64>,
}

#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum MarkerKind {
    Bullet,
    Dash,
    Arrow,
    None,
    Character,
    Asset,
}

#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LayerPatchParam {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub w: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub h: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotation: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visible: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locked: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blend_mode: Option<BlendMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<BTreeMap<String, String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<TextStyleParam>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<FillParam>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke: Option<StrokeParam>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub corner_radius: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub points: Option<Vec<f64>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tension: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fit: Option<ImageFit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub items: Option<Vec<ListItemParam>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub marker: Option<ListMarkerParam>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub marker_gap: Option<f64>,
    /// Nullable advanced effects/sticker objects are detailed in the guide.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effects: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sticker: Option<Value>,
}

#[derive(Deserialize, Serialize, JsonSchema)]
#[serde(tag = "type", rename_all_fields = "camelCase")]
pub enum McpOperationParam {
    #[serde(rename = "addLayer")]
    AddLayer {
        layer: LayerParam,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        index: Option<u32>,
    },
    #[serde(rename = "updateLayer")]
    UpdateLayer {
        layer_id: String,
        patch: LayerPatchParam,
    },
    #[serde(rename = "deleteLayers")]
    DeleteLayers { layer_ids: Vec<String> },
    #[serde(rename = "reorderLayer")]
    ReorderLayer { layer_id: String, to_index: u32 },
    #[serde(rename = "groupLayers")]
    GroupLayers {
        layer_ids: Vec<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        name: Option<String>,
    },
    #[serde(rename = "ungroupLayer")]
    UngroupLayer { layer_id: String },
    #[serde(rename = "addArtboard")]
    AddArtboard {
        preset: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        name: Option<String>,
    },
    #[serde(rename = "setActiveArtboard")]
    SetActiveArtboard { artboard_id: String },
}
