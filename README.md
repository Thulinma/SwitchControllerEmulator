Switch Controller Emulator
==========================

This is a simple nodejs-based websocket server for controlling a LUFA-compatible microcontroller posing as a Nintendo Switch Controller, over a serial connection.
It supports basic button scripting/queueing, as well as control through on-screen buttons or a real controller (as long as it's compatible with the HTML5 Gamepad API, which is practically all gamepads/controllers/joysticks/etc).

In plain English: This is a small program that will let your computer pretend to be a controller to your Nintendo Switch!

It can be used for anything from automatically performing actions (such as inputting patterns generated by the [ACNH Pattern Tool](https://acpatterns.com)) all the way to letting a friend be your player two over the internet.

[![Example usage with ACPatterns](https://img.youtube.com/vi/Tn_ROY2n6zw/0.jpg)](https://www.youtube.com/watch?v=Tn_ROY2n6zw "Example usage with ACPatterns")

Requirements
------------

You need a piece of hardware that will connect to your switch to actually send the button presses.
This software was written to make use of the [Switch Input Emulator by wchill](https://github.com/wchill/SwitchInputEmulator), but you only need the "Arduino" directory from that repository. You can follow the instructions in the readme there, but here's a short summary:

- Get your hands on a LUFA-compatible microcontroller. For example an Teensy 2.0++, Arduino UNO R3, Arduino Micro, etc.  
  I personally used a generic Atmega32u4 chip, marketed as compatible with the Arduino Micro. You can find these in various online shops for a few dollars, [this is the one I grabbed](https://www.aliexpress.com/item/32819992328.html) but you do __not__ _need_ that exact one! It was simply the cheapest I could find at the time.
- Get your hands on a serial port.  
  Any kind will do, but USB UART controllers are convenient for most modern computers, as these no longer come standard with serial ports these days. 🙁
  I personally grabbed [this CH340G](https://www.aliexpress.com/item/4000120687489.html), but seriously, any serial port will do.

Preparations
------------

Before you can start, you first need to flash the microcontroller. Go into the `Arduino` directory in the [Switch Input Emulator by wchill](https://github.com/wchill/SwitchInputEmulator), and compile it for your microcontroller (instructions are in the `README` of that project).
Once compiled, plug your microcontroller into your computer and flash it.
There is no generic way that you can flash _any_ microcontroller, so you need to follow steps specific to the one you bought!

> In my case I had an Atmega32u4, which you can flash (on Linux, at least) by running this command:
> `avrdude -C//etc/avrdude.conf -v -patmega32u4 -cavr109 -P/dev/ttyACM0 -b57600 -D -Uflash:w:./Joystick.hex:i`
> This is just an example. Do __NOT__ run that command if you bought a different microcontroller!
> For your convenience, here's a [precompiled binary for the atmega32u4](Joystick.hex).

If your flashing was successful, it should now show up on your computer as a `HORIPAD S` Gamepad.  
If it does, well done! If it doesn't, try again. 🙂

To get the software ready, you just need to run `npm install` to install the dependencies, that's all.

How to use
----------

- Connect your microcontroller and your serial port together.  
  You only need three pins to connect: connect the `RX` (receive) pin on each device to the `TX` (send) pin on the other, and connect a `GRND` (ground) pin between the two devices.
  If you're confused, [here's an example image of how you could connect them](https://cdn.discordapp.com/attachments/422272378018463745/840640336518840340/IMG_20210508_184108.jpg). In this image both are plugged into a laptop, but that was just for testing purposes.
- Plug your microcontroller into your Nintendo Switch.  
  You can plug it into the dock, or use an OTG adapter and plug it into the Switch directly. Nothing will happen at first, this is normal. If your serial port controller has status lights, they might already light up. There is no need to be alarmed either way.
- Plug the serial port controller into your computer.
  It should show up as (surprise, surprise) a serial port. On Mac and Linux it will probably work immediately out of the box, on Windows you might need to download a driver for it first. If needed, a driver should be available from wherever you bought yours.
- Run `node index.js` to start the software. It should auto-detect your serial port and print `Controller initialized!`. If you have more than one serial port, it will list the options and you should type the path/name of the correct serial port after the command as its first command line argument.

The software will listen on port 5353 for incoming websocket connections. Included is the example `control.html`. Simply open up this file and it should load in your browser and provide a rudimentary way to send keypresses, use gamepads/controllers, and send scripts.

Command syntax
--------------

If you want to write your own applications that make use of this software and/or want to write your own scripts, this is the syntax for commands sends over the websocket.
There is one command per line (separate them by at least a newline, carriage returns are ignored), everything is case-insensitive, and you may include as many or as little commands in a single message as you want.


`hold`  
This command will enable "hold mode". In this mode, whatever keypress command you last sent, will continue to be held until a new keypress is sent. This mode works well for buttons/controllers, but is not convenient for scripting.

`nohold`  
This command disables the above-mentioned "hold mode". In this mode, after a keypress has been completed, all keys will be released automatically.

`clear`  
This command clears the current keypress queue, effectively "resetting" it and cancelling any running script.

`KEYPRESS;DURATION;LABEL`  
Where:
- `KEYPRESS` is the key(s) you want to be pressed. This can be a JSON object or a space-separated list of keys (see below).
- `DURATION` is how many milliseconds you want the key(s) to be pressed for. It's optional, and defaults to 100 milliseconds.
- `LABEL` is a label that should be sent over the websocket when the keypress has completed. This is to aid in scripting. It's optional, and defaults to an empty string (meaning no label should be send).

Keys
----

- `a`, `b`, `x`, `y`, `minus`, `plus`, `home`, `capture`: Each of these is their corresponding button
- `l`, `r`: The left/right shoulder buttons
- `zl`, `zr`: The left/right triggers
- `dup`, `dleft`, `ddown`, `dright`, `dupright`, `ddownright`, `ddownleft`, `dupleft`: The directions on the D-pad (AKA left-controller buttons).
- `lstick`, `rstick`: Pressing down on the left/right sticks
- `left`, `right`, `up`, `down`: Fully moving the left stick in these directions
- `lleft`, `lright`, `lup`, `ldown`: Fully moving the right stick in these directions. (To clarify: the `l` stands for "look", as this stick usually controls the camera.)

For full control over the two sticks (as opposed to having only 8 directions and neutral available), it's also possible to use the syntax `ls:XX:YY` where `XX` and `YY` are each a number from 0 to 255, where 127 is neutral. `ls` controls the left stick, and `rs` controls the right stick. (If the JSON notation is used, the syntax is `ls:[XX, YY]` instead.)

