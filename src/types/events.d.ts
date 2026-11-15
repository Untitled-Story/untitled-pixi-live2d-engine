import type { InternalModel, ModelSettings } from '@/cubism-common'
import type { Texture } from '@pixi/core'
import type { Sound } from '@pixi/sound'
import type { JSONObject } from './helpers'

export interface Live2DModelEvents {
  /**
   * @event - One or more hit areas are hit.
   * @param - The names of *hit* hit areas.
   */
  hit: [string[]]

  /**
   * @event - The settings JSON has been loaded.
   * @param - The settings JSON object.
   */
  settingsJSONLoaded: [JSONObject]

  /**
   * @event - The ModelSettings has been loaded.
   * @param - The ModelSettings instance.
   */
  settingsLoaded: [ModelSettings]

  /**
   * @event - The textures have all been loaded.
   * @param - The texture array.
   */
  textureLoaded: [Texture[]]

  /**
   * @event - The InternalModel has been loaded.
   * @param - The InternalModel instance.
   */
  modelLoaded: [InternalModel]

  /**
   * @event - The Pose has been loaded.
   * @param - The Pose instance, varies in different Cubism version.
   */
  poseLoaded: [unknown]

  /**
   * @event - The Physics has been loaded.
   * @param - The Physics instance, varies in different Cubism version.
   */
  physicsLoaded: [unknown]

  /**
   * @event - All the essential resources have been loaded.
   */
  ready: []

  /**
   * @event - All the resources have been loaded.
   */
  load: []
}

export interface MotionManagerEvents<Motion = never> {
  /**
   * @event - A Motion resource has been loaded. The instance is a cached template,
   * not the independent instance used for playback.
   */
  motionLoaded: [group: string, index: number, motion: Motion]

  /**
   * @event - A fresh playback instance has been created and can be customized.
   * Fired on the primary MotionManager for both normal and parallel playback.
   */
  motionInstanceCreated: [group: string, index: number, motion: Motion]

  /**
   * @event - An error occurs when loading a Motion.
   * @param - The error.
   */
  motionLoadError: [group: string, index: number, error: unknown]

  /** @event - A motion has started. */
  motionStart: [group: string, index: number, audio: Sound | null | undefined]

  /** @event - Motion playback has finished. */
  motionFinish: []

  /**
   * @event - Before destroyed.
   */
  destroy: []
}

export interface ExpressionManagerEvents<Expression = never> {
  /**
   * @event - An Expression has been loaded.
   * @param - The Expression instance, varies in different Cubism version.
   */
  expressionLoaded: [index: number, expression: Expression]

  /**
   * @event - An error occurs when loading an Expression.
   * @param - The error.
   */
  expressionLoadError: [index: number, error: unknown]

  /**
   * @event - Before destroyed.
   */
  destroy: []
}

export interface InternalModelEvents {
  /**
   * @event - Before the model's parameters are updated by the motion.
   */
  beforeMotionUpdate: []

  /**
   * @event - After the model's parameters are updated by the motion.
   */
  afterMotionUpdate: []

  /**
   * @event - Before the model is updated with its parameters applied.
   */
  beforeModelUpdate: []

  /**
   * @event - Before destroyed.
   */
  destroy: []
}
