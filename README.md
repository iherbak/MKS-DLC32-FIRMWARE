# MKS-DLC32-FIRMWARE
- Modified source code for my UI https://github.com/iherbak/DLC32-Angular
- Other UI-s are not compatible with this firmware because of changes see below

## Environment construction:

- vscode

- platformIO

PlatformIOc needs to be installed on vscode.

Open Firmware with vscode, and platformIO will be started, In the platform.ini file，

Change -DMACHINE_FILENAME to your desired version

Then compile and upload.


## Changes
- No [ESP800] use /firmware endpoint instead for a nice parsable json instead
- Websocket mesages now Starts like "<State:" so better for parsing
