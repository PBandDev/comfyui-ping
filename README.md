# comfyui-ping

`comfyui-ping` plays a sound in your ComfyUI browser tab when a workflow finishes.

You can use it globally for every run, or drop a `Ping` node into a workflow when you want local overrides.

Created with [comfyui-custom-node-template](https://github.com/PBandDev/comfyui-custom-node-template).

## Features

- Different sounds for success and failure
- Global notifications or node-based notifications
- Sound preview buttons in settings
- Custom sound uploads
- Queue modes for `every prompt` or `queue drained`

## Install

### ComfyUI Manager

1. Open `Custom Nodes Manager`
2. Search and install `comfyui-ping`
3. Restart ComfyUI

## Use

Open ComfyUI settings and find `comfyui-ping`.

From there you can:

- turn notifications on or off
- choose success and failure sounds
- preview sounds
- upload a custom sound
- adjust volume
- choose whether notifications fire on every prompt or only when the queue finishes

If you want workflow-specific behavior, add the `Ping` node to your graph and use its overrides.

## Bundled sounds

- `beep-ping.wav`
- `harmonic-beep.wav`
- `notification-soft.wav`
- `ping-failure.wav`
- `ping-ringtone.wav`
- `ping-success.wav`

Defaults:

- success: `ping-success.wav`
- failure: `ping-failure.wav`

## Custom sounds

Supported formats:

- `.wav`
- `.mp3`
- `.ogg`
- `.m4a`
- `.flac`

Maximum upload size:

- `10 MiB`

If a custom sound is missing or unreadable, `comfyui-ping` logs a warning and stays silent.
