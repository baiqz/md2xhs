import zipfile
p = r"E:\workbuddyspace1\space1\md2xhs\_test\out-test.zip"
z = zipfile.ZipFile(p)
bad = z.testzip()
out = ["testzip=%s" % bad, "names=%s" % z.namelist()]
for n in z.namelist():
    d = z.read(n)
    out.append("%s len=%d head=%s" % (n, len(d), d[:14]))
open(r"E:\workbuddyspace1\_zipcheck.txt","w",encoding="utf-8").write("\n".join(out))
