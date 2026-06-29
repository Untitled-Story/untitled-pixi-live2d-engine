import { ModelSettings } from '@/cubism-common/ModelSettings'
import { applyMixins } from '@/utils'
import type * as CubismSpec from '@cubism/CubismSpec'
import { CubismDefaultParameterId } from '@cubism/cubismdefaultparameterid'
import { CubismModelSettingJson } from '@cubism/cubismmodelsettingjson'
import type { CubismIdHandle } from '@cubism/id/cubismid'

type CubismModelSettingJsonMixin = Omit<CubismModelSettingJson, 'name'>

const defaultEyeBlinkParameters = [
  CubismDefaultParameterId.ParamEyeLOpen!,
  CubismDefaultParameterId.ParamEyeROpen!
]

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface CubismModelSettings extends CubismModelSettingJsonMixin {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CubismModelSettings extends ModelSettings {
  declare json: CubismSpec.ModelJSON

  moc!: string
  textures!: string[]
  layout?: Record<string, number>
  hitAreas?: { Id: string; Name: string }[]
  expressions?: CubismSpec.Expression[]
  motions?: Record<string, CubismSpec.Motion[]>

  // methods mixed in from CubismModelSettingJson (stubs for type checking)
  declare getEyeBlinkParameterCount: () => number
  declare getEyeBlinkParameterId: (index: number) => CubismIdHandle
  declare getLipSyncParameterCount: () => number
  declare getLipSyncParameterId: (index: number) => CubismIdHandle

  static isValidJSON(json: unknown): json is CubismSpec.ModelJSON {
    if (!json || typeof json !== 'object') {
      return false
    }

    const references = (json as { FileReferences?: unknown }).FileReferences

    if (
      !references ||
      typeof references !== 'object' ||
      typeof (references as { Moc?: unknown }).Moc !== 'string'
    ) {
      return false
    }

    const textures = (references as { Textures?: unknown }).Textures

    if (!Array.isArray(textures) || textures.length === 0) {
      return false
    }

    const textureNamesAreStrings = textures.every((item) => typeof item === 'string')

    if (!textureNamesAreStrings) {
      return false
    }

    const expressions = (references as { Expressions?: unknown }).Expressions

    const isValidExpression = (expression: unknown): expression is { File: string } => {
      return !!expression && typeof (expression as { File?: unknown }).File === 'string'
    }

    const hasInvalidExpressions =
      expressions !== undefined &&
      (!Array.isArray(expressions) ||
        expressions.some((expression) => !isValidExpression(expression)))

    return !hasInvalidExpressions
  }

  constructor(json: CubismSpec.ModelJSON & { url: string }) {
    super(json)

    if (!CubismModelSettings.isValidJSON(json)) {
      throw new TypeError('Invalid JSON.')
    }

    // this doesn't seem to be allowed in ES6 and above, calling it will cause an error:
    // "Class constructor CubismModelSettingsJson cannot be invoked without 'new'"
    //
    // CubismModelSettingsJson.call(this, json);

    const buffer = new TextEncoder().encode(JSON.stringify(json)).buffer

    Object.assign(this, new CubismModelSettingJson(buffer, buffer.byteLength))

    // populate plain fields expected by ModelSettings consumers
    this.moc = json.FileReferences.Moc
    this.textures = [...json.FileReferences.Textures]
    this.pose = json.FileReferences.Pose
    this.physics = json.FileReferences.Physics
    this.expressions = json.FileReferences.Expressions?.filter(
      (expression): expression is CubismSpec.Expression =>
        !!expression && typeof expression.File === 'string'
    )
    this.motions = json.FileReferences.Motions ?? json.Motions
    this.layout = json.Layout
    this.hitAreas = json.HitAreas

    const mocStem = this.getFileStem(this.moc)
    this.setModelName(mocStem, this.name)
  }

  replaceFiles(replace: (file: string, path: string) => string) {
    super.replaceFiles(replace)

    if (this.motions) {
      for (const [group, motions] of Object.entries(this.motions)) {
        for (let i = 0; i < motions.length; i++) {
          const motion = motions[i]

          if (!motion?.File) {
            continue
          }

          motion.File = replace(motion.File, `motions.${group}[${i}].File`)

          if (motion.Sound) {
            motion.Sound = replace(motion.Sound, `motions.${group}[${i}].Sound`)
          }
        }
      }
    }

    if (this.expressions) {
      for (let i = 0; i < this.expressions.length; i++) {
        const expression = this.expressions[i]
        if (!expression?.File) continue

        expression.File = replace(expression.File, `expressions[${i}].File`)
      }
    }
  }

  getEyeBlinkParameters(): string[] {
    const parameters: string[] = []
    const count = this.getEyeBlinkParameterCount?.() ?? 0

    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const id = this.getEyeBlinkParameterId?.(i)
        if (id?.getString) {
          parameters.push(id.getString().s)
        }
      }
    } else {
      let hasEyeBlinkGroup = false
      const groups = this.json.Groups

      if (Array.isArray(groups)) {
        for (const group of groups) {
          if (group?.Name !== 'EyeBlink') continue

          hasEyeBlinkGroup = true

          if (!Array.isArray(group.Ids)) continue

          for (const entry of group.Ids) {
            if (typeof entry === 'string') {
              parameters.push(entry)
            } else if (entry?.Id) {
              parameters.push(entry.Id)
            }
          }
        }
      }

      if (hasEyeBlinkGroup) {
        return parameters
      }
    }

    return parameters.length ? parameters : [...defaultEyeBlinkParameters]
  }

  getLipSyncParameters(): string[] {
    const parameters: string[] = []
    const count = this.getLipSyncParameterCount?.() ?? 0

    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const id = this.getLipSyncParameterId?.(i)
        if (id?.getString) {
          parameters.push(id.getString().s)
        }
      }
    } else if (Array.isArray(this.json.Groups)) {
      const groups = this.json.Groups

      for (const group of groups) {
        if (group?.Name !== 'LipSync' || !Array.isArray(group.Ids)) continue

        for (const entry of group.Ids) {
          if (typeof entry === 'string') {
            parameters.push(entry)
          } else if (entry?.Id) {
            parameters.push(entry.Id)
          }
        }
      }
    }

    return parameters
  }
}

applyMixins(CubismModelSettings, [CubismModelSettingJson])
