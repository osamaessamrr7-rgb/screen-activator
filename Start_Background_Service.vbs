Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\Administrator.WIN-QH4JMRVJL7B\Desktop\Screen_Activator_Portal"
WshShell.Run "cmd /c python server.py", 0, False
