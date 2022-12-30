# MKS-DLC32-FIRMWARE
- Modified source code for my UI https://github.com/iherbak/DLC32-Angular
- Other UI-s are not compatible with this firmware because of changes see below

### Only supporting and tested with a Normal (non-CoreXY) Laser engraver with only X and Y axis ( TwoTrees TT-5.5S) 

## Environment construction:

- vscode

- platformIO

PlatformIOc needs to be installed on vscode.

Open Firmware with vscode, and platformIO will be started, In the platform.ini file，

Change -DMACHINE_FILENAME to your desired version

Then compile and upload.

## Changes
- No [ESP800] use /firmware endpoint instead for a nice parsable json instead
- more json format as answer to be more consistent
- /grblsettings endpoint to get grbl settings as a json instead of relying on websocket answer
- /espcommand endpoint to handle esp commands
- /command only handles non-esp commands, like grbl and gcode commands
- /boundary endpoint to figure out file boundary to be able to draw bounds
- both /command and /espcommand looks for cmd query param (no more commandText or plain)

- Websocket status messages
	- are starting like "<State:" so better for parsing
	- Hold message now adds HoldState (<State:Hold|HoldState:0...) to be able to parse it nicely

