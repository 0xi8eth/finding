# Finding.js

Thư viện tìm đường trên lưới 2D bằng JavaScript, có thể dùng trong Node.js hoặc chạy trực tiếp trong trình duyệt. Repo này cũng có giao diện minh họa trong thư mục `visual/` để vẽ mê cung, nhập mê cung từ ảnh, chỉnh sửa tường và chạy thuật toán tìm đường.

## Tính năng chính

- Tạo lưới đi được/không đi được bằng `PF.Grid`.
- Hỗ trợ nhiều thuật toán tìm đường: A*, Dijkstra, Breadth First Search, Best First Search, IDA*, Jump Point Search và các biến thể hai chiều.
- Có giao diện trực quan để xem quá trình thuật toán mở node, đóng node và vẽ đường đi.
- Có chức năng nhập mê cung từ ảnh trong giao diện `visual/`.

## Cài đặt

Cần cài Node.js trước. Repo hiện đã được cập nhật để chạy test với Node.js mới.

```bash
npm install
```

## Cách mở giao diện

Cách nhanh nhất:

1. Mở thư mục repo.
2. Mở file `visual/index.html` bằng trình duyệt.
3. Vẽ mê cung hoặc chọn ảnh mê cung trong khung bên trái.
4. Chọn thuật toán ở khung bên phải.
5. Nhấn `Bắt đầu tìm kiếm`.

Trên Windows có thể mở trực tiếp bằng File Explorer:

```text
C:\code\finding\visual\index.html
```

Hoặc chạy từ PowerShell:

```powershell
Start-Process .\visual\index.html
```

Nếu trình duyệt của bạn chặn một số file local, hãy chạy bằng server tĩnh:

```bash
npx http-server .
```

Sau đó mở URL mà terminal in ra, ví dụ:

```text
http://localhost:8080/visual/
```

## Nhập mê cung từ ảnh

Trong giao diện `visual/`:

1. Chọn ảnh ở phần `Nhập mê cung từ ảnh`.
2. Điều chỉnh `Ngưỡng tường` nếu ảnh nhận diện chưa đúng.
3. Bật/tắt `Vùng tối là tường` tùy ảnh của bạn.
4. Nhấn `Áp dụng ảnh`.
5. Sau khi scan xong, có thể tiếp tục vẽ/xóa tường hoặc kéo điểm bắt đầu/kết thúc.
6. Nhấn `Bắt đầu tìm kiếm` để chạy thuật toán.

## Dùng trong Node.js

Ví dụ cơ bản:

```javascript
var PF = require('./');

var matrix = [
    [0, 0, 0, 1, 0],
    [1, 0, 0, 0, 1],
    [0, 0, 1, 0, 0]
];

var grid = new PF.Grid(matrix);
var finder = new PF.AStarFinder();
var path = finder.findPath(1, 2, 4, 2, grid);

console.log(path);
```

Trong matrix:

- `0` là ô đi được.
- `1` là tường/vật cản.

Lưu ý: mỗi lần gọi `findPath`, object `grid` có thể bị thay đổi. Nếu cần dùng lại cùng một lưới, hãy clone trước:

```javascript
var path = finder.findPath(1, 2, 4, 2, grid.clone());
```

## Một số thuật toán có sẵn

- `AStarFinder`
- `BestFirstFinder`
- `BreadthFirstFinder`
- `DijkstraFinder`
- `IDAStarFinder`
- `JumpPointFinder`
- `BiAStarFinder`
- `BiBestFirstFinder`
- `BiBreadthFirstFinder`
- `BiDijkstraFinder`

Các thuật toán có tiền tố `Bi` là phiên bản tìm kiếm hai chiều.

## Chạy test

```bash
npm test
```

Hoặc chạy qua Gulp:

```bash
npx gulp test
```

Kết quả hiện tại mong đợi:

```text
63 passing
```

## Build bản chạy trên trình duyệt

```bash
npx gulp compile
```

File build sẽ được tạo trong thư mục `lib/`.

## Cấu trúc thư mục

```text
.
|-- benchmark   # benchmark thuật toán
|-- docs        # tài liệu cũ
|-- src         # source code thuật toán
|-- test        # test
|-- visual      # giao diện demo trong trình duyệt
|-- index.js    # entry point Node.js
|-- package.json
`-- gulpfile.js
```
