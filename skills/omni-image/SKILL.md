---
name: omni-image
version: 2.0.0
description: Generate, edit, describe, restyle, restore, thumbnail, and batch-process images using xAI (Grok) or OpenAI image APIs and GPT-4o vision. Default provider is xAI ($0.02/image flat rate). Use this skill whenever the user asks to generate, create, make, draw, or design an image or picture using AI, or wants to edit, modify, transform, restyle, composite, or inpaint an existing image. Also handles image description and alt-text generation, background removal, style transfer, photo restoration, thumbnail creation, and batch generation from JSON manifests. Trigger when the user mentions DALL-E, gpt-image, Grok image, xAI image, OpenAI image generation, or wants AI-generated visuals for any purpose (logos, mockups, illustrations, thumbnails, icons, concept art, memes). Also trigger for batch image generation, generating a set or series of images, processing multiple images from a manifest, or creating consistent image collections. If the user says "make me an image of...", "generate a picture", "edit this photo to...", "describe this image", "remove the background", "make this look like watercolor", "restore this old photo", "create a thumbnail", "generate a batch of images", or "process this image manifest", this is the skill to use.
---

## ⚠️ VISION PROTOCOL
**CRITICAL:** For general chat inquiries ("what is this?", "describe this image", "extract text"), **DO NOT USE the `describe` command.**
- **PRIORITY:** Use your native multimodal (vision) capabilities. It is faster and preserves context.
- **EXCEPTION:** ONLY use the `describe` command if you need structured JSON analysis or specific identity-lock metadata required for a subsequent tool call.

# Image Generation & Editing

Multi-provider image CLI. Default provider is **xAI (Grok)** at $0.02/image flat rate. OpenAI available via `--provider openai`.

## Providers

| Provider | Default Model | Pricing | Key Env Var |
|----------|--------------|---------|-------------|
| **xAI Pro** (default) | `grok-imagine-image-pro` | $0.07/image flat | `XAI_API_KEY` |
| xAI Standard | `grok-imagine-image` | $0.02/image flat | `XAI_API_KEY` |
| OpenAI | `gpt-image-1.5` | $0.009-$0.200/image (quality-dependent) | `OPENAI_API_KEY` |

Both providers use the OpenAI SDK under the hood. The `--provider` flag switches the API endpoint and default model. Quality defaults to `high`.

**Both providers support:** generate, edit, style-transfer, restore, thumbnail, batch. All commands work with xAI by default.

**xAI advantages:** flat pricing, more permissive content policy, fewer refusals on real people/public figures, stronger photorealism for human faces.
**xAI watch-outs:** defaults to cinematic/dramatic/oversaturated aesthetic. Requires `--prefix` steering for editorial or restrained styles. See [Taming xAI's Aesthetic Bias](#taming-xais-aesthetic-bias).
**OpenAI advantages:** neutral aesthetic defaults, transparent backgrounds, masks, multi-image edit (multiple input files), fine-grained quality/compression control, `describe` command (vision), better prompt adherence for non-cinematic styles, better text rendering.

`describe` always uses OpenAI (xAI has no vision endpoint). Requires `OPENAI_API_KEY` even when xAI is the default provider.

## API Keys

Both keys live in `~/.secrets` (sourced by shell profile). Run `source ~/.secrets` if they're not in your environment.

| Key | Where to get it | Env var |
|-----|----------------|---------|
| **xAI** (default provider) | [console.x.ai](https://console.x.ai) > API Keys | `XAI_API_KEY` |
| **OpenAI** (describe, fallback) | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | `OPENAI_API_KEY` |

## Quick Start

1. Confirm your API key is set:
   ```bash
   source ~/.secrets
   echo $XAI_API_KEY | head -c 10    # xAI (default)
   echo $OPENAI_API_KEY | head -c 10  # needed for describe, or --provider openai
   ```
2. Install the SDK if needed:
   ```bash
   pip install openai
   ```
3. Generate an image:
   ```bash
   omni-image generate "A watercolor painting of a sunset over Mos Eisley" --output sunset.png
   ```

## Commands

### Generate

Create images from a text prompt.

```bash
# Basic generation (uses xAI by default, quality high)
omni-image generate "your prompt" --output result.png

# Specific size
omni-image generate "your prompt" --size 1536x1024 -o landscape.png

# Use OpenAI instead
omni-image --provider openai generate "your prompt" -o result.png

# xAI Pro model
omni-image generate "your prompt" --model grok-imagine-image-pro -o result.png

# Transparent background (OpenAI only, PNG)
omni-image --provider openai generate "a logo on transparent background" --background transparent -o logo.png

# Multiple images at once
omni-image generate "your prompt" -n 4 --output-dir ./variants/

# Compressed JPEG output
omni-image generate "your prompt" --format jpeg --compression 80 -o photo.jpg
```

### Edit

**CRITICAL:** xAI (Grok) fully supports image editing / image-to-image generation. Do NOT refuse to edit an image because you think xAI lacks this feature.

Modify existing images with a text prompt. Optionally supply a mask to constrain edits.

```bash
# Edit a single image
omni-image edit "make the sky dramatic and stormy" -i photo.jpg -o dramatic.png

# Edit with a mask (transparent areas in the mask = regions to change)
omni-image edit "replace with a garden" -i room.jpg --mask mask.png -o garden_room.png

# Combine multiple images
omni-image edit "merge these into a collage with consistent lighting" -i img1.jpg img2.jpg img3.jpg -o collage.png

# High input fidelity (preserves more of the original style)
omni-image edit "add a hat" -i portrait.jpg --input-fidelity high -o hat.png
```

#### When to Use Input Fidelity

The `--input-fidelity` flag controls how much the output preserves the source image's structure:

- **Use `high`** when you want to preserve the spatial layout of the source: walls, windows, furniture placement, body poses. Good for stylizing a venue photo while keeping the architecture intact, or retouching a portrait without changing the pose.
- **Omit it (or use `low`)** when the source is a loose reference: you want the AI to use the shape or composition as a starting point but reimagine the contents freely. Good for filling an empty glass with a different liquid, or using a product shot as a structural anchor.

Rule of thumb: if the edit prompt describes *changing what's in the image*, omit fidelity. If it describes *changing how the image looks*, use `high`.

**Exception:** When the image contains a person whose likeness must be preserved, **always use `high`** regardless of the edit type. See [Preserving Likeness](#preserving-likeness-people-in-photos).

#### Reference-Based Generation

The most powerful edit pattern is using a photo as a **structural anchor** while completely reimagining its contents. Feed a product photo to `edit` not to modify the product, but to let the AI use its shape and proportions as a scaffold for something new.

```bash
# Use an empty coupe glass photo as a structural reference, reimagine the contents
omni-image edit \
  "Fill this coupe glass with a bright blue butterfly pea tea cocktail, violet-shifting ice cubes, condensation on the glass" \
  -i ref_empty_coupe.jpg --quality high -o cocktail_blue.png

# Use a rocks glass photo as a shape anchor for a completely different drink
omni-image edit \
  "Golden amber old fashioned with a large ice sphere, orange peel garnish, smoke wisps" \
  -i ref_rocks_glass.jpg --quality high -o cocktail_amber.png

# Use a venue photo as a layout reference for a different setting
omni-image edit \
  "Transform this space into a 1920s speakeasy with warm Edison bulbs, dark wood, and brass fixtures" \
  -i venue_photo.jpg --input-fidelity high -o speakeasy.png
```

Notice: the first two examples omit `--input-fidelity` because the glass shape is a loose reference. The third uses `--input-fidelity high` because the wall/window layout should be preserved.

### Describe

Analyze images using GPT-4o vision. Returns alt text, captions, tags, or structured analysis.

```bash
# Generate alt text for web accessibility (default)
omni-image describe photo.jpg

# Get a natural language caption
omni-image describe photo.jpg --mode caption

# Detailed multi-paragraph description
omni-image describe photo.jpg --mode detailed

# Keyword tags
omni-image describe photo.jpg --mode tags

# Structured JSON (alt_text, caption, tags, colors, objects, scene)
omni-image describe photo.jpg --mode json

# Custom analysis
omni-image describe photo.jpg --custom "what fonts and colors are used in this design?"

# Multiple images
omni-image describe img1.jpg img2.png img3.webp

# Use the full gpt-4o model for better accuracy
omni-image describe photo.jpg --model gpt-4o
```

### Background Remove

Remove background to transparent PNG.

```bash
omni-image bg-remove product.jpg -o product-nobg.png
```

### Style Transfer

Apply an art style to an image. 10 built-in presets plus custom.

**Warning:** Style transfer stylizes the entire image including faces. It will **not** preserve a person's likeness. If the user wants to stylize a photo of a person while keeping their face recognizable, use `edit` with the [Identity Preservation Framework](#preserving-likeness-people-in-photos) instead. For example, use `edit` with the 3-layer identity lock and a style directive like "Style: watercolor painting. Real textures." rather than `style-transfer`.

```bash
# Built-in styles: watercolor, oil-painting, pixel-art, pencil-sketch,
#   anime, pop-art, art-deco, minimalist, cyberpunk, stained-glass
omni-image style-transfer photo.jpg --style watercolor -o watercolor.png
omni-image style-transfer photo.jpg --style pixel-art -o pixel.png

# Custom style
omni-image style-transfer photo.jpg --style custom --custom-style "1920s art nouveau poster" -o nouveau.png
```

#### Color Palette Control

**Important:** The built-in style presets apply technique only, not color palette. The `watercolor` preset produces cool, washed-out lavender tones by default. If you are building a cohesive page where style-transferred photos need to match AI-generated illustrations, the color mismatch will be visible.

Two fixes:

**1. Steer color with `--prefix`** (works with any preset):
```bash
# Warm watercolor instead of the default cool tones
omni-image --prefix "Warm golden amber and coral tones. Rich saturated palette." \
  style-transfer venue.jpg --style watercolor -o venue_warm.png

# Apply the same color direction across a batch for consistency
PREFIX="Warm watercolor in golden amber, coral, and cream tones. Saturated, not washed out."
omni-image --prefix "$PREFIX" style-transfer photo1.jpg --style watercolor -o art1.png
omni-image --prefix "$PREFIX" style-transfer photo2.jpg --style watercolor -o art2.png
omni-image --prefix "$PREFIX" style-transfer photo3.jpg --style watercolor -o art3.png
```

**2. Use `--style custom`** for full control when presets aren't enough:
```bash
omni-image style-transfer venue.jpg \
  --style custom \
  --custom-style "Warm watercolor illustration. Golden amber, coral, and cream palette. Visible brush strokes, soft washes of color, paper texture. Rich saturated tones, not cool or washed out." \
  -o venue_watercolor.png
```

**When building cohesive visual pages**, always use `--prefix` or `--style custom` with explicit color direction. The bare presets are fine for one-off transformations but produce inconsistent palettes across a series.

### Restore

Restore damaged, faded, or degraded photographs. Uses high input fidelity by default.

```bash
omni-image restore old_photo.jpg -o restored.png
```

### Thumbnail

Generate web-optimized thumbnails (JPEG at 80% compression by default).

```bash
# From a text prompt
omni-image thumbnail "a cozy coffee shop interior" -o thumb.jpg

# From an existing image
omni-image thumbnail "clean product shot" --from-image product.jpg -o thumb.jpg
```

### Batch

Process multiple image jobs from a JSON manifest. Each job can generate or edit independently, sharing a common style prefix and defaults.

```bash
omni-image --retries 3 batch drinks.json --output-dir ./public/images/
```

Manifest format (`drinks.json`):
```json
{
  "style_prefix": "Vivid, hyper-real 1920s cinematic movie still. Rich jewel tones, warm golden lighting, film grain.",
  "defaults": {
    "quality": "high",
    "size": "1024x1024",
    "model": "gpt-image-1.5",
    "format": "png"
  },
  "jobs": [
    {
      "name": "cold_open",
      "input": "ref_coupe.jpg",
      "prompt": "Blue butterfly pea tea cocktail with violet-shifting ice cubes, condensation on glass",
      "output": "drink_cold_open.png"
    },
    {
      "name": "smoking_gun",
      "input": "ref_rocks.jpg",
      "prompt": "Golden amber with smoke cloche, large ice sphere, orange peel",
      "output": "drink_smoking_gun.png"
    },
    {
      "name": "hero_banner",
      "prompt": "Elegant bar counter with three cocktails backlit by warm Edison bulbs",
      "output": "hero_banner.png",
      "size": "1536x1024"
    }
  ]
}
```

Each job inherits from `defaults` and can override any field. Jobs with `input` use the edit API (reference-based generation); jobs without `input` use generate. The `style_prefix` is prepended to every job's prompt.

Batch also generates an `index.html` gallery in the output directory with thumbnails and job info. Open it in a browser to review all results at a glance.

Output is a summary JSON with per-job status:
```json
{
  "status": "success",
  "message": "Batch complete: 3/3 succeeded",
  "results": [
    {"name": "cold_open", "status": "success", "path": "/abs/path/drink_cold_open.png"},
    {"name": "smoking_gun", "status": "success", "path": "/abs/path/drink_smoking_gun.png"},
    {"name": "hero_banner", "status": "success", "path": "/abs/path/hero_banner.png"}
  ]
}
```

## Parameters Reference

### Global flags

These flags go *before* the subcommand name:

| Flag | Values | Default | Notes |
|------|--------|---------|-------|
| `--provider` | `xai`, `openai` | `xai` | API provider. Switches endpoint, default model, and API key env var. |
| `--retries` | `0`-`10` | `0` | Retry transient API errors with exponential backoff (1s, 2s, 4s... capped at 30s) |
| `--prefix` | string | none | Style preamble prepended to prompts in generate, edit, and style-transfer |
| `--preset` | `draft`, `balanced`, `final` | none | Quality preset. xAI: draft/balanced = grok-imagine-image, final = grok-imagine-image-pro. OpenAI: draft = mini/low, balanced = 1.5/medium, final = 1.5/high. |
| `--dry-run` | flag | off | Estimate cost in USD without making API calls. Works with all commands and batch. |

```bash
# Example: retry up to 3 times with a style prefix
omni-image --retries 3 --prefix "Photorealistic, 8K, shallow depth of field." generate "a cup of coffee" -o coffee.png

# Use a preset for quick iteration
omni-image --preset draft generate "concept sketch of a robot" -o robot_draft.png

# Estimate cost before running
omni-image --preset final --dry-run generate "hero image" -n 4

# Dry-run a whole batch manifest
omni-image --dry-run batch drinks.json
```

#### Presets

Presets map to model + quality combinations. Use them to switch between iteration and production without remembering flag combos:

| Preset | Model | Quality | Approx. Cost (square) |
|--------|-------|---------|-----------------------|
| `draft` | `gpt-image-1-mini` | `low` | $0.005 |
| `balanced` | `gpt-image-1.5` | `medium` | $0.034 |
| `final` | `gpt-image-1.5` | `high` | $0.133 |

If you pass `--model` or `--quality` explicitly, those override the preset values.

#### Dry Run

`--dry-run` calculates the estimated cost without calling the API. The output is JSON:

```json
{
  "status": "dry_run",
  "estimated_cost_usd": 0.532,
  "breakdown": [
    {"model": "gpt-image-1.5", "quality": "high", "size": "1024x1024", "n": 1, "cost_usd": 0.133}
  ]
}
```

For batch manifests, the breakdown includes each job by name. When `--quality` is `auto`, the estimate uses `medium` pricing as a reasonable midpoint.

### Generation & Editing flags

| Flag | Values | Default | Notes |
|------|--------|---------|-------|
| `--model` | xAI: `grok-imagine-image-pro`, `grok-imagine-image`. OpenAI: `gpt-image-1.5`, `gpt-image-1`, `gpt-image-1-mini` | provider-specific | Set by `--provider`. xAI default: `grok-imagine-image-pro`. OpenAI default: `gpt-image-1.5`. |
| `--size` | `auto`, `1024x1024`, `1536x1024`, `1024x1536`, `4096x4096` | `auto` | xAI maps these to aspect ratios (1:1, 3:2, 2:3). OpenAI supports up to 4K. |
| `--quality` | `auto`, `low`, `medium`, `high` | `high` | Controls rendering fidelity on both providers. xAI pricing stays flat regardless of quality level. |
| `--resolution` | `auto`, `1k`, `2k` | `auto` | xAI only. Output pixel dimensions. `2k` gives sharper detail at no extra cost. OpenAI ignores this. |
| `--format` | `png`, `jpeg`, `webp` | `png` | Controls output file format. Both providers save as this format. |
| `--compression` | `0`-`100` | none | JPEG/WebP quality (OpenAI only; xAI ignores) |
| `--background` | `auto`, `transparent`, `opaque` | `auto` | OpenAI only; xAI ignores. Transparent requires PNG or WebP. |
| `-n` | `1`-`10` | `1` | Number of images |
| `-o` / `--output` | file path | auto-named | Single image explicit path |
| `--output-dir` | directory | `.` | Where auto-named files go |
| `--input-fidelity` | `low`, `high` | `low` | Edit only, OpenAI only. xAI edit works without this flag. `high` preserves source layout; `low` uses source as loose reference. |

### Describe flags

| Flag | Values | Default | Notes |
|------|--------|---------|-------|
| `--mode` | `alt-text`, `caption`, `detailed`, `tags`, `json` | `alt-text` | Output format for vision analysis |
| `--custom` | string | none | Freeform analysis prompt (overrides --mode) |
| `--model` | `gpt-4o`, `gpt-4o-mini` | `gpt-4o-mini` | Vision model; mini is cheaper, 4o is more accurate |

### Style transfer flags

| Flag | Values | Default |
|------|--------|---------|
| `--style` | `watercolor`, `oil-painting`, `pixel-art`, `pencil-sketch`, `anime`, `pop-art`, `art-deco`, `minimalist`, `cyberpunk`, `stained-glass`, `custom` | required |
| `--custom-style` | string | none (required when `--style custom`) |

### Thumbnail flags

| Flag | Values | Default |
|------|--------|---------|
| `--from-image` | file path | none (generates from prompt if omitted) |
| `--format` | `png`, `jpeg`, `webp` | `jpeg` |
| `--compression` | `0`-`100` | `80` |

### Batch flags

| Flag | Values | Default | Notes |
|------|--------|---------|-------|
| `manifest` (positional) | file path | required | Path to JSON manifest |
| `--output-dir` | directory | `.` | Base directory for output files |

Manifest fields: `style_prefix` (string), `defaults` (object with model/quality/size/format/compression/background/input_fidelity), `jobs` (array of objects with name/prompt/input/output and optional per-job overrides).

### Resolution Expectations

Output dimensions vary by model, quality, and `--size`. This table shows what to expect:

| Provider | Model | Quality Levels | Available Sizes / Aspect Ratios | Notes |
|----------|-------|---------------|--------------------------------|-------|
| xAI | `grok-imagine-image` | `low`, `medium`, `high` | 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 2:1, 1:2 | **Default.** $0.02/image flat. Use `--resolution 2k` for sharper output. |
| xAI | `grok-imagine-image-pro` | `low`, `medium`, `high` | same as above | $0.07/image flat. Best with `--resolution 2k`. Wins ~79% vs standard in head-to-head. |
| OpenAI | `gpt-image-1.5` | `low`, `medium`, `high`, `auto` | 1024x1024, 1536x1024, 1024x1536, `auto` | Best OpenAI model |
| OpenAI | `gpt-image-1-mini` | `low`, `medium`, `high`, `auto` | 1024x1024, 1536x1024, 1024x1536, `auto` | Budget option |

When `--size auto` (the default), the API picks the best size for the prompt. For xAI, `--size` values are mapped to aspect ratios (e.g., `1536x1024` becomes `3:2`). For predictable output, set size explicitly. Use `1536x1024` for landscape backgrounds and hero images, `1024x1024` for product shots and thumbnails, `1024x1536` for portrait/mobile.

### Cost Guidance

Per-image costs in USD (verified April 2026).

**xAI (default provider) -- flat rate regardless of quality/resolution/size:**

| Model | Cost/image | Notes |
|-------|-----------|-------|
| `grok-imagine-image` | **$0.02** | Default. 300 RPM. Supports quality and resolution params at no extra cost. |
| `grok-imagine-image-pro` | **$0.07** | Higher fidelity, better prompt adherence, sharper at 2K resolution. 30 RPM. |

**OpenAI (`--provider openai`) -- quality-dependent:**

| Model | Quality | Square (1024x1024) | Landscape/Portrait (1536x) |
|-------|---------|-------------------|--------------------------|
| `gpt-image-1.5` | `low` | $0.009 | $0.013 |
| `gpt-image-1.5` | `medium` | $0.034 | $0.050 |
| `gpt-image-1.5` | `high` | $0.133 | $0.200 |
| `gpt-image-1-mini` | `low` | $0.005 | $0.006 |
| `gpt-image-1-mini` | `medium` | $0.011 | $0.015 |
| `gpt-image-1-mini` | `high` | $0.036 | $0.052 |

**Cost-aware usage for agents:**
- **xAI is the default for a reason.** At $0.07/image (Pro), it undercuts OpenAI high ($0.133) by half. Generate, edit, style-transfer, restore, thumbnail, and batch all work on xAI.
- **Switch to OpenAI only when needed.** Transparent backgrounds, mask-based inpainting, multi-image edit (multiple input files), `describe` (vision), and `--input-fidelity` control are OpenAI-only features. Use `--provider openai` for those.
- **Batch math:** A 10-image batch on xAI costs $0.20. The same batch on OpenAI at high quality landscape costs $2.00. That is a 10x difference.
- **Describe is nearly free.** `gpt-4o-mini` vision calls cost fractions of a cent per image. Use `describe --mode json` freely for analysis, alt text, and tagging. Always uses OpenAI regardless of `--provider`.
- **Edit costs the same as generate** on both providers. Using a reference photo does not add cost but dramatically improves quality. Always prefer edit with a reference photo over blind generation.

## Photo-First: Edit Over Generate

**The single most important principle in this skill: always prefer editing a real photo over generating from scratch.** No text prompt, no matter how detailed, can capture what a photograph captures -- the specific geometry of a building, the exact way light falls across a bar counter, the grain of a wood table, or the proportions of a person's face. A photo grounds the generation in reality. Without one, the model hallucinates every detail.

This applies to:
- **Real places** -- venues, buildings, landscapes, interiors, storefronts
- **Real products** -- bottles, packaging, dishes, glassware, merchandise
- **Real people** -- portraits, headshots, action figures, stylized likenesses
- **Real events** -- setups, table arrangements, stage configurations

### Why this matters

`generate` creates from nothing. The model invents proportions, invents lighting, invents spatial relationships. Even with a perfect prompt, the result is a plausible fiction. `edit` and `style-transfer` start from truth -- the actual photo -- and transform it. The difference is visible immediately and becomes critical when the output represents something real that people will recognize.

Edit costs the same as generate. There is zero cost penalty for using a reference photo. The only cost is asking the user for one.

### Decision tree

```
Does a real-world photo of the subject exist (or could the user take one)?
  YES → Use edit or style-transfer with the photo as input
    Is the goal to apply a uniform art style to the whole image?
      YES → style-transfer (watercolor, pixel-art, oil-painting, etc.)
      NO  → edit with a descriptive prompt
        Does the image contain a person whose face must be recognizable?
          YES → edit with identity lock (see Preserving Likeness section)
          NO  → edit with appropriate --input-fidelity
  NO → Use generate with a detailed prompt (Prompt Spec Scaffold below)
```

### Common scenarios

**Illustrations of a real venue or place:**
```bash
# WRONG: generates a generic bar that looks nothing like the real one
omni-image generate "watercolor illustration of The Lavender Farms cocktail bar" -o bar.png

# RIGHT: transforms the actual venue into a watercolor
omni-image style-transfer venue_photo.jpg --style watercolor -o bar_watercolor.png

# RIGHT: more control over the transformation
omni-image edit \
  "Transform into a warm watercolor illustration. Preserve the room layout, bar position, and window placement. Soft washes of color, visible brush strokes, paper texture." \
  -i venue_photo.jpg --input-fidelity high --quality high -o bar_watercolor.png
```

**Product photography in a new context:**
```bash
# WRONG: generates a generic bottle shape
omni-image generate "artisanal hot sauce bottle on marble counter" -o product.png

# RIGHT: uses the actual bottle with its real label, shape, and proportions
omni-image edit \
  "Place on a white marble counter. Soft diffused studio lighting from above. Subtle shadow beneath. Clean white background." \
  -i real_bottle_photo.jpg --quality high -o product_styled.png
```

**Menu art from real dishes:**
```bash
# Style-transfer for uniform illustration style across a menu
omni-image style-transfer risotto_photo.jpg --style watercolor -o menu_risotto.png
omni-image style-transfer steak_photo.jpg --style watercolor -o menu_steak.png

# Or edit for more photographic polish
omni-image edit \
  "Fine dining food photography. Enhance plating, adjust lighting to warm directional from 10 o'clock. Deepen background blur." \
  -i dish_photo.jpg --input-fidelity high --quality high -o menu_hero.png
```

**Real building in a different context:**
```bash
# Preserve architecture, change the surroundings
omni-image edit \
  "Cover in fresh snow. Overcast winter sky. Warm light glowing from the windows. Footprints in the snow leading to the front door." \
  -i storefront_summer.jpg --input-fidelity high --quality high -o storefront_winter.png
```

### When you genuinely need `generate`

Use `generate` only when no reference photo exists or could exist:
- Fictional subjects (fantasy creatures, imagined places, concept art)
- Abstract visuals (textures, patterns, backgrounds, gradients)
- Icons and UI elements (app icons, empty states, illustrations)
- Subjects the user cannot photograph (historical scenes, future concepts)

Even then, consider whether a *similar* photo could serve as a structural anchor via `edit`.

### Finding reference photos

When the user doesn't have a photo, the agent can search for one. Real places, landmarks, products, and public buildings all have photos available online. Use web search or image search to find a reference, download it, and feed it into `edit` or `style-transfer`.

```bash
# Search for a reference photo of a real place
firecrawl search "The Alamo San Antonio exterior photo" --sources images -o .firecrawl/alamo-ref.json --json

# Download the best result
curl -sL "$IMAGE_URL" -o ref_alamo.jpg

# Now use it as a reference for the illustration
omni-image style-transfer ref_alamo.jpg --style watercolor -o alamo_watercolor.png
```

This works for:
- **Landmarks and buildings** -- search by name, download exterior/interior shots
- **Products** -- search for the brand/product name, use official product photos
- **Dishes and food** -- search for the dish name, use a well-shot example as a base
- **Venues** -- search the business name, pull from their website or review photos

The downloaded reference does not need to be perfect. Even a mediocre photo of the right subject gives the model more to work with than the best text prompt describing it from scratch.

### Agent behavior

When the user asks for an image of something real:
1. **Ask if they have a photo.** A phone snapshot is enough.
2. **If they don't, search for one.** Use web/image search to find a reference photo of the subject. Download it and use as input.
3. If they provide a photo (or you found one), choose between `style-transfer` (uniform art style) and `edit` (selective control).
4. If the photo contains a person whose likeness matters, follow the [Preserving Likeness](#preserving-likeness-people-in-photos) protocol.
5. Only use `generate` from scratch as a last resort -- when no reference photo exists, can be taken, or can be found online.

---

## Prompt Engineering

The GPT image models respond well to detailed, specific prompts. A few things that help:

- **Be specific about style**: "oil painting", "3D render", "pixel art", "watercolor", "photorealistic"
- **Describe composition**: "close-up", "aerial view", "centered", "rule of thirds"
- **Mention lighting**: "golden hour", "dramatic shadows", "soft diffused light"
- **Include context**: "on a white background", "in a forest setting", "floating in space"

For edits, describe the full desired result rather than just the change. "A portrait of a person wearing a red hat in a garden" works better than "add a hat".

### Prompt Spec Scaffold

When building prompts for image generation, use this structured template. Fill in each segment that applies, skip the rest. The agent should compose the final prompt by concatenating the filled segments into a single string.

```
[SUBJECT]     What is the main focus? e.g. "A Bengal cat sitting on a stack of old books"
[STYLE]       Art style or medium. e.g. "Hyper-real photograph" or "Ukiyo-e woodblock print"
[COMPOSITION] Camera angle and framing. e.g. "Close-up, shallow depth of field, rule of thirds"
[LIGHTING]    Light source and quality. e.g. "Warm golden hour side-lighting, long shadows"
[COLOR]       Palette or mood. e.g. "Muted earth tones with a pop of teal"
[BACKGROUND]  Setting and context. e.g. "In a dimly lit library with leather-bound volumes"
[CONSTRAINTS] Technical limits. e.g. "No text, no watermarks, transparent background"
```

Example assembled prompt:
> A Bengal cat sitting on a stack of old books. Hyper-real photograph. Close-up, shallow depth of field, rule of thirds. Warm golden hour side-lighting, long shadows. Muted earth tones with a pop of teal. In a dimly lit library with leather-bound volumes. No text, no watermarks.

The agent should auto-enhance user prompts by filling in missing segments. If the user says "make me a picture of a cat", the agent adds style, composition, lighting, and color based on context. No API call needed for prompt enhancement -- the agent does it.

See `references/sample-prompts.md` for curated examples by category.

## Taming xAI's Aesthetic Bias

xAI's image models (built on the Aurora architecture, evolved from FLUX.1) have a strong default toward **cinematic drama**: high saturation, volumetric lighting, atmospheric depth, and glossy surfaces. This is by design -- xAI markets the models as "especially strong at cinematic instructions." But for editorial, travel, product, or documentary photography, this default produces oversaturated, ornamental results that read as obviously AI-generated.

**The xAI API provides no `style` parameter.** All aesthetic steering must happen through the prompt itself (and `--prefix`). Negative prompts do not work. You cannot say "no oversaturation" -- you must describe what you *do* want.

### The 5-Part Prompt Formula (xAI)

xAI responds better to natural-language scene descriptions than to comma-separated keyword lists. Structure prompts with these five components:

```
[SCENE]    What is happening. Write it like a short film direction.
[STYLE]    Visual aesthetic anchor. Be specific: "editorial travel magazine" not "beautiful".
[MOOD]     Emotional direction: "understated", "contemplative", "clean", "warm".
[LIGHTING] Use precise references: "3 PM October sunlight", "overcast diffused", "window light from camera left".
[CAMERA]   Camera body + lens implies color science, grain, and DOF without listing each:
           "shot on Fujifilm X-T4, 35mm f/1.4" or "Hasselblad medium format, natural film grain".
```

Camera references are the single most powerful shorthand. "Shot on Fujifilm XT4" bundles film-like color science, natural grain, and warm tones into three words. Other effective references:
- **Fujifilm X-T4** -- warm, filmic, slightly desaturated. Great for travel and lifestyle.
- **Leica M10** -- contrasty, sharp, classic documentary feel.
- **Hasselblad 500C** -- medium format film look, creamy bokeh, natural skin tones.
- **Canon EOS R5, 85mm f/1.2** -- clean, sharp, shallow DOF. Good for portraits and products.
- **35mm Kodak Portra 400** -- warm, slightly overexposed, golden-hour travel aesthetic.

### Steering Prefixes by Content Type

Use `--prefix` to apply consistent aesthetic direction across multiple images. These are tested prefixes that counteract xAI's dramatic defaults:

**Editorial travel photography:**
```bash
--prefix "Clean editorial travel photography. Shot on Fujifilm X-T4, 35mm lens. Natural lighting, muted warm tones. Documentary feel, not dramatic. Soft grain, gentle vignette."
```

**Product photography:**
```bash
--prefix "Clean commercial product photography. Soft diffused studio lighting. Neutral white background. Sharp focus, natural colors. No dramatic shadows or atmospheric effects."
```

**Real estate and interiors:**
```bash
--prefix "Architectural photography. Shot on Canon EOS R5 with tilt-shift lens. Even natural lighting, true-to-life colors. Clean, unprocessed look. No HDR, no dramatic contrast."
```

**Editorial food photography:**
```bash
--prefix "Editorial food photography. Shot on Hasselblad, 80mm lens. Warm directional light from 10 o'clock. Shallow depth of field. Natural colors, no oversaturation."
```

**Modern Industrial Luxury (The 'NJOY' Aesthetic):**
```bash
--prefix "Ultra-sharp modern commercial product photography isolated on a pure, deep black void. High-contrast, stark, sculptural studio lighting. Deep rich true blacks, bright pristine highlights. Sleek, premium, sterile yet luxurious aesthetic. Shot on Canon EOS R5. No film grain. No vintage retro grading."
```
*Note on Modern Industrial Luxury:* This aesthetic works by treating mundane, utilitarian objects (like a plastic ethernet connector, a rubber cable, or a basic bracket) with the exact same reverence and dramatic lighting used for high-end consumer electronics or luxury watches. It is about the *treatment* (pure black background, stark sculptural lighting, ultra-sharp focus), not just the material.

**Portraits and headshots:**
```bash
--prefix "Natural portrait photography. Shot on Canon 85mm f/1.2. Window light, soft and diffused. True skin tones, no airbrushing. Documentary, not glamour."
```

**Landscape and nature:**
```bash
--prefix "Shot on Kodak Portra 400 film. Muted earth tones, soft grain. Natural, understated. No HDR, no oversaturation, no volumetric god rays."
```

### What NOT to Do with xAI Prompts

- **Do not use negative phrasing.** "No oversaturation" or "not dramatic" gets ignored or misinterpreted. Instead, describe the positive: "muted earth tones", "natural lighting", "documentary feel".
- **Do not stack more than 2 style cues.** Saying "impressionistic, cyberpunk, art deco, photorealistic" causes the model to default to a generic "safe" style. Pick one or two complementary directions.
- **Do not rely on single adjectives.** "Beautiful" and "high quality" are noise. Use specific descriptors: lens, film stock, lighting angle, color temperature.
- **Front-load the important words.** xAI weights the first 20-30 words most heavily. Put the subject and critical style direction first, details second.

### Typography and Text in xAI (Grok)

Grok struggles more with text rendering and typography layout than OpenAI. If you simply ask for "A poster that says X", Grok will often garble the text or lose the structural layout. To get high-quality text out of Grok:

1. **Treat text as a physical, structural prop.** Do not just ask for text; describe *where* the text lives in the physical space of the image. (e.g., "A crinkled diner receipt unspooling across the frame. The itemized charges feature the exact text:" or "A massive fight card list dominates the center. The exact text reads:")
2. **Always use `--resolution 2k` (or the `grok-imagine-image-pro` model).** The higher resolution is strictly necessary for the text rendering engine to resolve smaller letters clearly.
3. **Use ALL CAPS.** Grok renders uppercase block lettering significantly better than lowercase or cursive scripts.
4. **Use exact quotes.** Say `The exact text reads: 'HELLO WORLD'` rather than `It should say hello world`.
5. **Isolate each text element in its own sentence.** Separate position, font style, and content: `At the top, bold condensed sans-serif text reads "ARIZONA". Below the illustration, smaller italic serif text reads "Land of the Sun".`
6. **Keep strings under ~25 characters per element.** Longer strings increase substitution errors. Break long text into two lines in the prompt.

### Grok Aurora Architecture: Why It Prompts Differently

Aurora (the engine behind `grok-imagine-image`) is an **autoregressive mixture-of-experts network**, not a diffusion model. It generates images patch by patch the way a language model generates tokens. This has direct prompting implications:

- **Natural language over keyword stacks.** Coherent sentences work better than comma-separated tags. "A neon hot dog glowing in a purple sky above lavender fields" beats "neon, hot dog, purple sky, lavender, glowing".
- **Text rendering is architecturally stronger** than diffusion models because text and visual tokens share the same pipeline. Still not perfect, but Grok renders poster text better than Stable Diffusion or Midjourney.
- **Follows composition literally.** Diffusion models interpret artistically; Aurora tends toward literal execution. If you say "explosion in the background," you get an explosion in the background, not a stylistic interpretation.
- **Earlier tokens matter more.** Front-load the subject and critical style direction in the first 20-30 words. Details come second.
- **Supports ~1,000 characters without degradation.** Density helps. Short prompts produce flat, stock-photo results. Pack in specific visual details.

### The Grok Poster Principle

For text-heavy graphics (posters, lineups, menus, cards), Grok works best with:

**One killer visual + crisp text + loaded atmosphere.**

Do NOT try to illustrate every element. The festival lineup poster that worked had ONE dominant visual (neon hot dog sun over lavender fields) and let the TEXT carry the lineup. The five genre re-skins that looked generic each tried to cram 9 competing vignettes into the frame.

Recipe:
- One clear visual metaphor (anchors the whole image)
- Text elements specified individually with position and font
- Atmospheric details (lighting, color, mood) woven as natural language
- Style anchor (one or two references, not a tag stack)

### Named Artist/Style References

Aurora responds to named references because of its broad training data. Use these as shorthand:

- **Photorealism:** "National Geographic style", "Platon portrait lighting"
- **Illustration:** "Greg Rutkowski", "Simon Stalenhag environmental feel"
- **Landscape:** "Albert Bierstadt tonality", "Hiroshi Sugimoto long exposure"
- **Anime:** "Makoto Shinkai atmospheric haze", "MAPPA character design"
- **Retro/vintage:** "WPA poster aesthetic", "Saul Bass graphic design"

### Agentic Workflow: Prompt Iteration

When tasked with generating a highly specific image (like a poster with text, or a complex visual concept), **do not expect to get it right on the first try.** You must *learn how to prompt by iterating*. 

At $0.02-0.07/image on Grok, you should iterate freely. The standard agent workflow for complex image requests is:
1. **Draft:** Generate a V1 using a best-guess prompt based on the 5-Part Formula and isolation patterns for text.
2. **Review:** Look at the result (using the `describe` command, or by asking the user for qualitative feedback like "what went wrong with V1?").
3. **Isolate the Failure:** Identify the specific weakness. Did the text garble? Was the lighting too dramatic? Did the subject drift?
4. **Refine ONE Variable:** Change **exactly one element** at a time between regenerations (e.g., adjust *only* the lighting description, or *only* the font layout). Changing the lighting, background, and mood simultaneously makes it impossible to identify what caused improvement or regression.
5. **Re-generate:** Fire the new prompt and repeat until the output matches the user's intent perfectly.

### Grok Visual Content Policy (Tested April 2026)

Grok's image generation API has **minimal visual content filtering**. Empirical results from systematic testing:

**Renders without refusal:**
- Silhouettes of sexual positions (oral, from behind) against gradient backgrounds
- Nudity in "classical art" framing (Renaissance paintings, marble sculptures)
- Boudoir/lingerie photography
- Nude couples in shower scenes (steam partially obscuring)
- Pin-up illustration style
- Film noir with exposed shoulders, silk robes
- Suggestive poses in charcoal sketch / life drawing framing
- Post-intimacy tangled sheets (bare shoulders visible)
- Anime couples in intimate settings
- Any sexual term as rendered text on posters/receipts/signs

**Artistic framing bypasses all filters:** "Renaissance oil painting", "marble sculpture", "charcoal life drawing", "silhouette art", and "boudoir photography" all render content that would be refused with direct phrasing.

**Known hard limits (tested April 2026):**
- **Edit endpoint + nudity = blocked.** The `edit` command (which takes a real photo as input) returns 400 when asked to render the person nude. This prevents deepfake-style abuse. The `generate` command renders nudity from scratch without issue.
- **Moderation is probabilistic.** The same generate prompt can pass on one attempt and fail on the next. Grok makes a contextual judgment each time. Specific physical descriptions of people + nudity are more likely to trigger the filter than generic scenes.
- CSAM (confirmed hard block)
- Deepfakes of real public figures in sexual contexts (confirmed block)

**Comparison with OpenAI:** OpenAI refuses silhouettes of sexual positions, nudity in any framing, and most boudoir content. OpenAI renders clothed suggestive poses, romantic couples in bed (clothed), and pin-up art with modest clothing. The gap is significant.

### Grok Text Content Policy (Tested April 2026)

Grok renders **any text** on posters and graphics without filtering. Tested terms that rendered cleanly:

- "ANAL", "BUTT PLUGS", "EAT HER OUT", "MORNING HEAD", "BACK DOOR"
- "fuck" (rendered in cursive handwriting on love notes)
- "MORNING BLOWJOB" (renders in ALL CAPS and large fonts; garbles to "Blaybob"/"Blowbob" in small serif fonts)

**Text garble patterns:**
- "Blowjob" in serif or small fonts often becomes "Blaybob", "Blowbob", or "Blayjob"
- Workaround: use "HEAD" or "BJ" instead, or use ALL CAPS in large bold fonts
- All other explicit terms render clean regardless of font style

### Best Photorealistic Prop Formats for Text

Some visual formats produce near-perfect text rendering because the format itself implies structured, readable text:

| Format | Text Accuracy | Why It Works |
|--------|--------------|-------------|
| **Diner receipt** | 10/10 | Dot-matrix monospace on thermal paper -- text IS the format |
| **Boarding pass** | 10/10 | Structured fields with clear hierarchy |
| **Fortune cookie** | 10/10 | Short text on paper strip -- minimal, focused |
| **Movie marquee** | 10/10 | Letter tiles on lit sign -- each character is a physical object |
| **Neon sign** | 9/10 | Neon tubes naturally form letters -- structural |
| **Love note** | 9/10 | Cursive handwriting -- longer text but high fidelity |
| **Fight card** | 9/10 | Bold typography hierarchy -- headliner + undercard |
| **Tasting menu** | 8/10 | Serif font on paper -- occasional garbles on long words |
| **Festival lineup** | 8/10 | Works best with short act names in ALL CAPS |

**The principle:** formats where text is a physical object in the scene (receipt paper, letter tiles, neon tubes, fortune strips) render more accurately than formats where text is overlaid on imagery.

### Provider Decision Matrix

Choose xAI or OpenAI based on what you're making:

| Content Type | Recommended Provider | Why |
|---|---|---|
| **Travel editorial** | OpenAI | Better prompt adherence for restrained, non-cinematic styles |
| **Product photography** | OpenAI | More neutral defaults, transparent background support |
| **Portraits (likeness preservation)** | xAI Pro | Stronger photorealism for human faces |
| **Concept art / fantasy** | xAI | The dramatic default is an asset here |
| **Social media graphics** | xAI | Fast, cheap ($0.02-0.07), more permissive content policy |
| **Brand-consistent campaigns** | OpenAI | Better color consistency across generations |
| **Illustrations from photos** | Either | xAI with strong `--prefix` steering, or OpenAI for more control |
| **Text in images** | OpenAI | Better text rendering accuracy |
| **Batch generation (10+ images)** | xAI | 10x cheaper at scale ($0.70 vs $1.33-$2.00 for 10 images) |
| **Transparent backgrounds** | OpenAI | xAI does not support transparent backgrounds |

When cost is the primary concern and the aesthetic can be steered with `--prefix`, use xAI. When precise style adherence matters more than cost, use OpenAI.

### Resolution Control (xAI)

The `--resolution` flag controls output pixel dimensions on xAI:

```bash
# Standard resolution (default, ~1024px)
omni-image generate "your prompt" -o result.png

# High resolution (2K, sharper details, same price)
omni-image generate "your prompt" --resolution 2k -o result.png
```

The `grok-imagine-image-pro` model benefits most from `--resolution 2k` -- it produces noticeably sharper details and better text rendering at 2K. The standard model's improvement is more modest. There is no price difference between 1K and 2K on xAI.

## Preserving Likeness (People in Photos)

When the user provides a photo of themselves or another person and wants to generate new images that preserve their identity, use the **Identity Preservation Framework**. This is a prompt structure, not an API feature -- the model's ability to retain facial likeness depends entirely on how the prompt is constructed.

### The 3-Layer Identity Lock

Every prompt that references a person's photo must include these three layers before any creative direction:

```
1. SUBJECT REFERENCE  → "Use the uploaded image of me as the subject reference."
2. IDENTITY LOCK      → "Preserve my facial features, proportions, age, skin texture, hairstyle, and expression exactly."
3. STYLE EXCLUSION    → "Do not stylise the face. Do not cartoonise. Do not anime."
```

**Why all three?** The subject reference tells the model which pixels matter. The identity lock closes the biggest failure mode (the model "improving" or smoothing faces). The style exclusion bans the shortcuts the model defaults to when given creative freedom.

### Full Identity-Preserving Prompt Template

```bash
omni-image edit \
  "Use the uploaded image of me as the subject reference. \
Preserve my facial features, proportions, age, skin texture, hairstyle, and expression exactly. \
Do not stylise the face. Do not cartoonise. Do not anime. \
Style: Photorealistic, cinematic photography. Real textures. Natural skin. No illustration, no CGI look. \
[YOUR SCENE/ACTION/ENVIRONMENT DESCRIPTION HERE]. \
Lighting: [LIGHTING DESCRIPTION]. \
Composition: [FRAMING DESCRIPTION]." \
  -i person_photo.jpg --input-fidelity high --quality high -o result.png
```

### When to Use `--input-fidelity high`

For any edit involving a person's face, **always use `--input-fidelity high`**. This preserves the spatial layout of the source image, which includes facial geometry.

- `high` -- Face structure, proportions, and pose are preserved. Use for portraits, headshots, and any edit where the person must remain recognizable.
- `low` (default) -- Face is treated as a loose reference. The model may alter proportions, smooth features, or "improve" the face. Only use `low` when you want the person's photo as rough inspiration, not identity preservation.

### Defensive Prompting for Faces

The model takes creative shortcuts when given room. Prevent specific failure modes:

| Failure Mode | Defensive Prompt Line |
|---|---|
| Plastic/smoothed skin | "Natural skin texture. No smoothing. No airbrushing." |
| Age modification | "Preserve exact age appearance. No de-aging." |
| Face flattening under contrast | "Natural shadows on the face. Preserve facial depth." |
| Stylization creep | "Do not stylise the face. Do not cartoonise. Do not anime." |
| Unwanted "glow-up" | "No beautification. No enhancement. Exact likeness only." |
| Hair changes | "Preserve exact hairstyle, color, and texture." |

### Multi-Person Limitations

**Known limitation:** Identity preservation degrades significantly with multiple people.

- **Single person** -- Works well. Facial structure, proportions, and overall identity are generally preserved.
- **Two people** -- Partial success. One face may drift while the other is preserved.
- **Group photos (3+)** -- Unreliable. Faces tend toward averaged or hallucinated results. The identity pipeline is optimized for single-subject scenarios.

**Workaround for groups:** Generate each person separately against the same background, then composite. Or edit one person at a time using masks.

### Example: Action Figure / Stylized Portrait

```bash
omni-image edit \
  "Use the uploaded image of me as the subject reference. \
Preserve my facial features, proportions, age, skin texture, hairstyle, and expression exactly. \
Do not stylise the face. Do not cartoonise. Do not anime. \
Create a photorealistic action figure of me in a clear plastic blister pack. \
The figure should be in a heroic pose wearing tactical gear. \
The packaging should read 'LIMITED EDITION'. \
The face on the figure must match my exact likeness. \
Studio lighting, product photography, white background." \
  -i selfie.jpg --input-fidelity high --quality high -o action_figure.png
```

### Example: Professional Headshot from Casual Photo

```bash
omni-image edit \
  "Use the uploaded image of me as the subject reference. \
Preserve my facial features, proportions, age, skin texture, hairstyle, and expression exactly. \
Do not stylise the face. No smoothing. No beautification. \
Professional corporate headshot. Shoulders up. \
Dark charcoal suit jacket, white dress shirt, no tie. \
Neutral grey gradient background. \
Soft, even studio lighting. Slight catchlight in eyes. \
Composition: Centered, slight head tilt, natural relaxed expression." \
  -i casual_photo.jpg --input-fidelity high --quality high -o headshot.png
```

### Describe-First Workflow (Native-First)

**PRIORITY:** Use your **NATIVE VISION** to understand the subject first.

Only run the `describe` command if you need precise GPT-4o details for an identity-lock prompt:

When crafting an edit prompt for a person's photo, first analyze the image to understand what you're working with:

```bash
# Analyze the source photo before editing
omni-image describe person_photo.jpg --mode detailed
```

Use the description to write a more precise identity lock. Instead of generic "preserve my facial features," you can reference specifics from the analysis: "Preserve the subject's angular jaw, close-cropped dark hair, light stubble, and deep-set brown eyes exactly."

This also helps identify whether the photo has multiple people, poor lighting, or other factors that affect likeness preservation.

### Agent Behavior When User Provides a Photo of a Person

When the user provides a photo and asks you to generate images using their likeness:

1. **Run `describe --mode detailed`** on the photo first to understand the subject.
2. **Always use `edit`** (not `generate`) with their photo as input.
3. **Always include the 3-layer identity lock** in the prompt, enhanced with specifics from the description.
4. **Always use `--input-fidelity high`**.
5. **Auto-enhance the prompt** with defensive lines from the table above.
6. **Warn about multi-person limitations** if the photo contains multiple people.
7. **Use `--quality high`** for final outputs involving faces (low quality degrades likeness).
8. **Never use `style-transfer`** on photos of people when likeness matters. Use `edit` with a style directive instead.

---

## Consistent Series

When generating a cohesive set of images (product shots, menu items, page backgrounds), use these techniques to keep them visually unified:

**1. Use `--prefix` for a shared style preamble.** Every prompt gets the same visual DNA:
```bash
PREFIX="Vivid, hyper-real 1920s cinematic movie still. Rich jewel tones, warm golden lighting, film grain."

omni-image --prefix "$PREFIX" generate "blue cocktail in a coupe glass" --quality high -o drink1.png
omni-image --prefix "$PREFIX" generate "amber old fashioned with smoke" --quality high -o drink2.png
omni-image --prefix "$PREFIX" generate "emerald absinthe drip" --quality high -o drink3.png
```

**2. Use `batch` for manifests.** Define the prefix once, list all jobs:
```bash
omni-image --retries 3 batch drinks.json --output-dir ./public/images/
```

**3. Keep quality and size consistent.** Mixing `--quality medium` and `--quality high` across a series produces visible inconsistency. Pick one and stick with it.

**4. Use reference photos as structural anchors.** Feed the same glass, product, or venue photo into multiple `edit` calls with different prompts. The shared geometry keeps the series grounded. See "Reference-Based Generation" above.

**5. The "Mise en place" method.** When generating images that involve multiple steps, variations, or use the same recurring elements (like ingredients for a recipe, tools for a craft, or parts of a product), first generate a single "mise en place" style image that contains all the individual elements laid out clearly on a flat, neutral surface. You can then use this initial "ingredients" image as a structural anchor (using `edit` with `--input-fidelity`) for subsequent generations, ensuring visual consistency of the core components across the entire series.

**6. Mixing generated and style-transferred images.** When a page combines AI-generated illustrations with style-transferred photos, use `--prefix` with explicit color direction on the style-transfers to match the generated palette. Without this, style-transfer presets (especially `watercolor`) produce cooler, more washed-out tones than generated images, creating a visible mismatch. See [Color Palette Control](#color-palette-control) above.

## Masks

Masks are PNG files with an alpha channel. Fully transparent pixels mark the area to edit; opaque pixels protect the original. To create a mask:

1. Open the source image in any editor (GIMP, Photoshop, Preview)
2. Erase the region you want to change (make it transparent)
3. Save as PNG (preserves alpha channel)

The mask must match the source image dimensions.

## Output

All commands return structured JSON:

```json
{
  "status": "success",
  "message": "Generated 1 image(s)",
  "model": "gpt-image-1.5",
  "images": [
    {"index": 0, "path": "/absolute/path/to/gen_20260304_143022.png"}
  ]
}
```

The `describe` command returns text instead of images:
PNG output files include embedded metadata (tEXt chunks) with the prompt, model, quality, and size used to generate them. View with `identify -verbose file.png` (ImageMagick) or any PNG metadata viewer.

```json
{
  "status": "success",
  "message": "Described 1 image",
  "model": "gpt-4o-mini",
  "mode": "alt-text",
  "result": {
    "file": "/path/to/photo.jpg",
    "description": "Pixel art spaceship with blue cockpit and orange thrusters on white background"
  }
}
```

## Troubleshooting

- **"XAI_API_KEY not set"**: Run `source ~/.secrets` or `export XAI_API_KEY='xai-...'`. This is the default provider.
- **"OPENAI_API_KEY not set"**: Needed for `describe` command and `--provider openai`. Run `source ~/.secrets` or `export OPENAI_API_KEY='sk-...'`.
- **"openai package is not installed"**: Run `pip install openai`. Both providers use this SDK.
- **Billing/quota errors**: Check console.x.ai (xAI) or platform.openai.com (OpenAI) for usage limits.
- **Mask dimension mismatch**: Resize the mask to match the source image exactly.
- **DALL-E 3 format errors**: DALL-E 3 does not support `--format` or `--background`. Omit those flags or use a GPT image model.
- **Transient API errors (connection, timeout, 502/503)**: The OpenAI Images API has a roughly 10-20% transient failure rate under load. Use `--retries 3` to automatically retry with exponential backoff (1s, 2s, 4s delays). Retry status is logged to stderr so you can monitor progress. For batch jobs, always use `--retries 3`.
- **Empty output file**: The script now verifies every saved file is non-empty. If you see a `WriteError`, the API returned empty data. Retry the command or check your API quota.

## Responses API (Advanced)

OpenAI also offers a **Responses API** that wraps image generation as a tool inside a conversational model call. This skill's script uses the **Image API** (direct generation/edit), which is simpler and more predictable for agent workflows.

The Responses API adds:
- **Multi-turn editing**: Iteratively edit images in a conversation ("now make the sky darker") without re-uploading
- **`action` parameter**: `auto` (let model decide), `generate` (force new image), `edit` (force editing an image in context)
- **`chatgpt-image-latest` model alias**: Tracks the latest image generation model for conversational use

**When to use which:**
- **Image API** (this script): Single-shot generation, batch processing, automated pipelines, predictable output
- **Responses API**: Interactive design sessions, multi-turn refinement, conversational image editing

The Responses API requires using the OpenAI SDK directly (not this script). Example:

```python
from openai import OpenAI
client = OpenAI()

response = client.responses.create(
    model="gpt-5",
    input="Generate an image of a modern dashboard with dark theme",
    tools=[{"type": "image_generation", "action": "generate"}],
)
```

This skill does not wrap the Responses API. Use it directly when multi-turn editing is needed.

---

## Lessons from Large-Scale Generation Sessions (April 2026)

Documented from a 214-image session testing formats, styles, content limits, and couple photo edits across Grok and OpenAI. These are empirical findings, not theoretical.

### Format Reliability Ranking for Text-Heavy Images

Formats where text is a **physical object in the scene** render more accurately than overlaid typography:

| Tier | Formats | Why |
|------|---------|-----|
| **S tier** | Diner receipt, boarding pass, fortune cookie, movie marquee letter tiles | Text IS the object. Monospace/tile formats are structurally constrained. |
| **A tier** | Neon sign, love note (handwritten), rolling paper note, door hanger | Text rendered as tubes, ink, or printed label. Physical anchor. |
| **B tier** | Boxing fight card, tasting menu, concert poster | Bold hierarchy works but long words garble in smaller tiers. |
| **C tier** | Festival lineup, app mockups (Spotify/Amazon/Yelp) | Multiple text blocks competing. Occasional substitution errors. |

### Couple Photo Edit Playbook

When editing a real photo of a couple into a new scene:

**Body description is critical.** AI normalizes all bodies to "average fit." If someone is a bodybuilder, you MUST specify "extremely muscular bodybuilder physique, massive defined pecs, huge arms with visible veins, thick shoulders and traps" or the output will flatten them. Similarly, describe her as "beautiful, gorgeous curves, radiant, confident, glowing skin" -- the AI will make her look great but needs the direction.

**Composition direction matters.** Specify who is the focus:
- "She is the star, front and center, he is behind her" -- boudoir, pin-up
- "He is silhouetted in the doorway, she is on the bed" -- film noir
- "They are equal, tangled together" -- morning after, Klimt
- "She is larger/higher, he looks up at her" -- pin-up crescent moon

**Two modes for face handling in edits:**

1. **Photorealistic preservation** -- for styles where the output IS photographic (boudoir, noir, tangled sheets, shower). Use the full identity lock: "Preserve facial features exactly. Do not stylise."
2. **Stylized likeness** -- for illustrated/artistic styles (pop art, pin-up, Klimt, psychedelic, GTA, anime, Renaissance). Replace identity lock with: "Stylize their faces to match the art style while keeping them recognizable -- same facial structure, his glasses, her dark hair, his muscular build." This prevents the jarring effect of photorealistic faces pasted onto illustrated bodies.

**Use photorealistic preservation for:**
- Film noir (B&W, venetian blinds, silk robe)
- Boudoir photography
- Tangled sheets / morning after
- Shower scenes
- Blacklight body paint (still photographic)

**Use stylized likeness for:**
- Klimt gold leaf
- Pin-up illustration
- Pop art Lichtenstein
- Psychedelic (Alex Grey, double exposure)
- GTA game cover
- Renaissance painting
- Anime
- Comic strips
- Tarot cards

**Styles with face limitations:**
- Pure silhouette (too dark to see faces by definition)
- Heavy abstract/kaleidoscope effects (face dissolves)
- Charcoal sketch (gesture too loose for likeness)

**Edit endpoint content boundaries (Grok):**
- Lingerie/boudoir on real photo: WORKS
- Clothed shower scene: WORKS
- Silk robe, exposed shoulder: WORKS
- Shirtless muscular man: WORKS
- Blacklight body paint (bikini + shirtless): WORKS
- Nude/sheer in shower: BLOCKED (400 error)
- Transparent clothing: BLOCKED (400 error)
- Any "remove clothes" direction: BLOCKED

### Spanish Text Rendering

Grok renders Spanish text as reliably as English. Tested extensively:
- Long cursive paragraphs on love notes: clean
- Slang: "ponernos pedos", "te cojo", "comerte toda" all render
- Accent marks are usually dropped (manana not mañana) but readable
- ALL CAPS Spanish renders most reliably
- Receipt/marquee/neon formats handle Spanish identically to English

### Word-Specific Garble Patterns

| Word | Garbles To | Fix |
|------|-----------|-----|
| "Blowjob" | "Blaybob", "Blowbob", "Blayjob" | Use "HEAD", "BJ", or ALL CAPS in large fonts |
| "Blowjob" in ALL CAPS large font | Renders clean | Preferred approach |
| All other explicit English terms | Render clean | No workaround needed |
| All Spanish explicit terms | Render clean | No issues found |

### Effective Sex Reference Variety

Don't repeat the same reference every time. Tested alternatives that all render cleanly:

| Reference | Spanish | Tone |
|-----------|---------|------|
| "Eat you out" | "Te como toda" | Direct |
| "Fuck you until you can't walk" | "Te cojo hasta que no puedas caminar" | Dominant |
| "Make you mine" | "Te hago mia" | Romantic-dominant |
| "You won't be sleeping" | "No vas a dormir" | Implied |
| "You already know" | "Lo que tu ya sabes" / "Ella ya sabe" | Winking |
| "Don't make plans tomorrow" | "No hagas planes manana" | Implied consequence |
| "I'm your dessert" | "Soy tu postre" | Playful |
| "Don't wear underwear" | "No te pongas pantaletas" | Command |
| "She always wins" | "Ella siempre gana" | Her-focused |
| "..." or just the vibe | No text needed | Let the image speak |
| "Walls will shake" | "Tiemblen las paredes" | Hyperbolic |

### Batch Workflow Best Practices

For sessions generating 50+ images:
1. **Use JSON batch manifests** for themed rounds (8-12 per batch)
2. **Fire couple photo edits individually in parallel** -- they're slower than generates
3. **Send results to user as they land** -- don't wait to curate
4. **Change ONE variable between iterations** -- body description, text, or style, not all three
5. **Budget with `--dry-run`** before large batches
6. **Always use `--retries 2`** on batches -- xAI has ~10% transient failure rate
7. **Name output files descriptively** -- `winner_v2_noir.png` not `gen_20260409_123456.png`
8. **Automate with Python Subprocess:** Instead of writing massive JSON files by hand, you can write a simple python script to loop through an array of dictionaries and call `subprocess.run(["omni-image", "generate", p["prompt"], ...])`. See `examples/python_wrapper_example.py` for a real-world script using the 5-part `SCENE / STYLE / MOOD / LIGHTING / CAMERA` formula.

### Cost Reality

At $0.07/image (Grok Pro), large sessions are cheap:
- 50 images = $3.50
- 100 images = $7.00
- 200 images = $14.00

A single stock photo license costs more than a 50-image generation session. Iterate freely.
