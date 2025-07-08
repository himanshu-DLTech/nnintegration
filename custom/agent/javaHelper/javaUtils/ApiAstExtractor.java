import com.github.javaparser.JavaParser;
import com.github.javaparser.ParseResult;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.NormalAnnotationExpr;
import com.github.javaparser.ast.expr.SingleMemberAnnotationExpr;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileWriter;
import java.util.*;

public class ApiAstExtractor {

    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            System.err.println("Usage: java ApiAstExtractor <path-to-java-project> <output-folder>");
            System.exit(1);
        }

        String projectRoot = args[0];
        String outputFolder = args[1];

        List<File> javaFiles = new ArrayList<>();
        collectJavaFiles(new File(projectRoot), javaFiles);

        JSONArray apiList = new JSONArray();

        JavaParser parser = new JavaParser();

        for (File file : javaFiles) {
            String relPath = file.getAbsolutePath().substring(new File(projectRoot).getAbsolutePath().length() + 1);
            try {
                ParseResult<CompilationUnit> result = parser.parse(file);
                if (!result.isSuccessful() || !result.getResult().isPresent()) continue;
                CompilationUnit cu = result.getResult().get();

                cu.findAll(ClassOrInterfaceDeclaration.class).forEach(clazz -> {
                    boolean isController = clazz.getAnnotations().stream().anyMatch(ApiAstExtractor::isControllerAnnotation);
                    if (isController) {
                        String className = clazz.getNameAsString();
                        String classMapping = getClassLevelMapping(clazz);
                        clazz.getMethods().forEach(method -> {
                            Optional<AnnotationExpr> apiAnn = getApiAnnotation(method);
                            if (apiAnn.isPresent()) {
                                String httpMethod = getHttpMethod(apiAnn.get());
                                String path = getPath(apiAnn.get());
                                if (classMapping != null && !classMapping.isEmpty()) {
                                    path = classMapping + (path.startsWith("/") ? path : "/" + path);
                                }
                                JSONObject apiObj = new JSONObject();
                                apiObj.put("httpMethod", httpMethod);
                                apiObj.put("endpoint", path);
                                apiObj.put("filePath", relPath.replace(File.separatorChar, '/'));
                                apiObj.put("class", className);
                                apiObj.put("method", method.getNameAsString());
                                apiList.put(apiObj);
                            }
                        });
                    }
                });
            } catch (Exception e) {
                System.err.println("Failed to parse: " + file.getAbsolutePath() + " (" + e.getMessage() + ")");
            }
        }

        File outputDir = new File(outputFolder);
        outputDir.mkdirs();
        File outputFile = new File(outputDir, "apis.json");
        try (FileWriter fw = new FileWriter(outputFile)) {
            fw.write(apiList.toString(2));
        }
        System.out.println("API extraction complete. See: " + outputFile.getAbsolutePath());
    }

    private static void collectJavaFiles(File dir, List<File> javaFiles) {
        if (dir.isDirectory()) {
            for (File f : Objects.requireNonNull(dir.listFiles())) {
                collectJavaFiles(f, javaFiles);
            }
        } else if (dir.isFile() && dir.getName().endsWith(".java")) {
            javaFiles.add(dir);
        }
    }

    private static boolean isControllerAnnotation(AnnotationExpr ann) {
        String name = ann.getNameAsString();
        return name.equals("RestController") || name.equals("Controller");
    }

    private static Optional<AnnotationExpr> getApiAnnotation(MethodDeclaration method) {
        for (AnnotationExpr ann : method.getAnnotations()) {
            String name = ann.getNameAsString();
            if (name.equals("RequestMapping") || name.equals("GetMapping") ||
                name.equals("PostMapping") || name.equals("PutMapping") ||
                name.equals("DeleteMapping") || name.equals("PatchMapping")) {
                return Optional.of(ann);
            }
        }
        return Optional.empty();
    }

    private static String getHttpMethod(AnnotationExpr ann) {
        String name = ann.getNameAsString();
        switch (name) {
            case "GetMapping": return "GET";
            case "PostMapping": return "POST";
            case "PutMapping": return "PUT";
            case "DeleteMapping": return "DELETE";
            case "PatchMapping": return "PATCH";
            case "RequestMapping":
                if (ann.isNormalAnnotationExpr()) {
                    NormalAnnotationExpr nae = ann.asNormalAnnotationExpr();
                    return nae.getPairs().stream()
                            .filter(p -> p.getNameAsString().equals("method"))
                            .map(p -> p.getValue().toString().replaceAll("RequestMethod\\.", ""))
                            .findFirst().orElse("ANY").replaceAll("\"", "");
                }
                return "ANY";
            default: return "ANY";
        }
    }

    private static String getPath(AnnotationExpr ann) {
        if (ann.isSingleMemberAnnotationExpr()) {
            return ann.asSingleMemberAnnotationExpr().getMemberValue().toString().replaceAll("\"", "");
        } else if (ann.isNormalAnnotationExpr()) {
            NormalAnnotationExpr nae = ann.asNormalAnnotationExpr();
            return nae.getPairs().stream()
                    .filter(p -> p.getNameAsString().equals("value") || p.getNameAsString().equals("path"))
                    .map(p -> p.getValue().toString().replaceAll("\"", ""))
                    .findFirst().orElse("");
        }
        return "";
    }

    private static String getClassLevelMapping(ClassOrInterfaceDeclaration clazz) {
        for (AnnotationExpr ann : clazz.getAnnotations()) {
            if (ann.getNameAsString().equals("RequestMapping")) {
                return getPath(ann);
            }
        }
        return "";
    }
}
