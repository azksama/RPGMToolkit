package androidx.documentfile.provider;

// DocumentFile's constructor is package-private; keep this adapter next to it.
public abstract class ToolkitDocumentFile extends DocumentFile {
    protected ToolkitDocumentFile(DocumentFile parent) {
        super(parent);
    }
}
