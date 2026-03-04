# ExtendToDroid
Gnome extension to extend screens to an RDP in android through ADB

Or it would be if I didnt give up on it cause gawd dang I dont have time for it. So im gonna explain what it was supposed to do in case someone needs it cause its really just 2 commands.

## The problem
I got a new samsung tablet, it came with a function that peeked my interest. SAMSUNG'S SECOND SCREEN. What a stupid name, name it anything so I can google it and see if people have come across the same stupid problem.
What it does is that it transforms your tablet into an external screen for your WINDOWS PC. Fucking disgustang. Try to google if that function has support for linux, as I said, its so stupid impossible to search for that specific fucntion. Cause its the most generic shit.

Now there are a ton of solutions, paid apps, config apps, fuck em. If you are on gnome you already have all you need.

## The solution
`gsettings set org.gnome.desktop.remote-desktop.rdp screen-share-mode extend`

Thats it. Now just use any RDP app in android and now you have an external wireless screen.
But what if you dont have internet or are in an office and there is no way you are gonna find your IP, let alone RDP into it.
Plug a cable to it dummy.

`adb reverse tcp:3389 tcp:3389`
And thats all, secondary screen compatible with almost any android brick.

### The requirements
This probably shouldve been before the solution but whatever I already spent too much time on this stupid rant.

1. Turn on RDP access on the settings in gnome
2. Have developer mode turned on in android

## Why make a gnome extension
Cause I wanted a pretty way to do this. Now yall get my stupid rant.

Thats it! Thats all! Have fun! Bye!
