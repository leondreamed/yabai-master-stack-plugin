# Yabai Master-Stack Plugin

![A screenshot of the Master-Stack plugin in action](/images/yabai-master-stack-plugin-screenshot.png)

[Yabai](https://github.com/koekeishiya/yabai) is an amazing tiling manager for macOS. However, since the algorithm Yabai uses is based on bsp (binary-space partitioning), implementing layouts such as the master-stack layout in [dwm](https://dwm.suckless.org/) is [not within their goals for the project](https://github.com/koekeishiya/yabai/issues/658#issuecomment-693687832). Luckily, Yabai provides an incredibly powerful signal system that can execute commands in response to an event in Yabai (e.g. when a window is created, deleted, etc.). This plugin leverages this powerful system to emulate the dwm-style master-stack layout in Yabai.

To "install" this plugin, make sure you have [Node.js](https://nodejs.org) installed. Then, run the following command to install the npm package globally:

```bash
npm install --global yabai-master-stack-plugin
```

Then, create a configuration file at `~/.config/ymsp/ymsp.config.json` with the following contents (make sure to replace `/usr/local/bin/yabai` with the path of your `yabai` executable; if you're not sure what it is, run `which yabai`):

```json
{
  "yabaiPath": "/usr/local/bin/yabai"
}
```

Then, add the following lines to your `.yabairc`:

```bash
yabai -m signal --add event=window_created action='ymsp window-created'

yabai -m signal --add event=application_launched action='ymsp window-created'

yabai -m signal --add event=window_moved action='ymsp window-moved'

ymsp on-yabai-start
```

Then, to make the actions of focusing on the next/prev window work smoothly, set the keybinds to execute the node scripts in the `fns` folder. For example, if you're using [skhd](https://github.com/koekeishiya/skhd), add the following into your `skhdrc` file:

```text
# focus windows
alt + j : ymsp focus-down-window
alt + k : ymsp focus-up-window

# adjust number of master windows
alt + shift - i : ymsp increase-master-window-count
alt + shift - d : ymsp decrease-master-window-count
```

## Troubleshooting

So there's this super obscure error when binding shell commands to Karabiner where the Node processes will abruptly exit without the onExit callback getting called when registered using the `signal-exit` package (which ends up causing a deadlock since the lockfile doesn't get released). To fix this error, you need to add a `> /dev/null` to the end of the node command in the karabiner `shell_command` property [(see this commit)](https://github.com/leonzalion/macos-configs/commit/a2f2b88c34e0d1cabb49e92fdadf6a284fecee93). I have absolutely no idea why this works, but I discovered it on accident when trying to debug the command by redirecting stdout to a file and then failing to reproduce the issue afterwards.

Maybe I'll add some kind of synchronization mechanism in the future where the plugin will check whether the process which registered the lock is still active, and if it's not active, then it'll delete the lock file or something.

## TODO

[] Add an option to temporary disable auto-positioning of a window.
