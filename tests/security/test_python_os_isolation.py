"""Verify kernel restrictions independently of the Python language filter."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'bot-runner'))
from app.sandbox.python_isolation import CHILD_ISOLATION


def _has_libseccomp():
    if not sys.platform.startswith('linux'):
        return False
    try:
        import ctypes
        ctypes.CDLL('libseccomp.so.2')
        return True
    except Exception:
        return False


@unittest.skipUnless(_has_libseccomp(), 'kernel isolation requires Linux with libseccomp2 installed')
class PythonOSIsolation(unittest.TestCase):

    def probe(self, code):
        bootstrap = 'import os,socket,sys\n' + CHILD_ISOLATION + '\ninstall_python_isolation()\n' + code
        result = subprocess.run([sys.executable, '-I', '-S', '-c', bootstrap],
                                text=True, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('BLOCKED', result.stdout)
        return result.stdout

    def test_host_files_are_unreadable(self):
        self.probe("try:\n    open('/etc/passwd').read()\nexcept PermissionError:\n    print('BLOCKED')\n")

    def test_filesystem_is_not_writable(self):
        with tempfile.TemporaryDirectory() as directory:
            target = str(Path(directory)/'must-not-exist')
            self.probe("try:\n    open("+json.dumps(target)+",'w').write('unsafe')\nexcept PermissionError:\n    print('BLOCKED')\n")
            self.assertFalse(Path(target).exists())

    def test_network_and_parent_signals_are_blocked(self):
        output=self.probe("try:\n    socket.socket()\nexcept PermissionError:\n    print('BLOCKED socket')\ntry:\n    os.kill(os.getppid(),0)\nexcept PermissionError:\n    print('BLOCKED signal')\n")
        self.assertIn('BLOCKED socket',output)
        self.assertIn('BLOCKED signal',output)

    def test_process_creation_is_blocked(self):
        self.probe("try:\n    pid=os.fork()\n    if pid==0:os._exit(0)\n    os.waitpid(pid,0)\nexcept PermissionError:\n    print('BLOCKED')\n")


if __name__ == '__main__':
    unittest.main()
