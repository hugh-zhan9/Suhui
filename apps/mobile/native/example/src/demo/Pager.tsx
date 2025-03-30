import { requireNativeView } from "expo"
import { Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

const EnhancePagerView = requireNativeView("EnhancePagerView")
const EnhancePageView = requireNativeView("EnhancePageView")
export const Pager = () => {
  const insets = useSafeAreaInsets()
  return (
    <View style={{ flex: 1, backgroundColor: "white", paddingTop: insets.top }}>
      <EnhancePagerView
        style={{
          flex: 1,
        }}
      >
        <EnhancePageView style={{ flex: 1, backgroundColor: "white" }}>
          <View>
            <Text>
              aaa Dignissimos repellendus voluptate. Beatae optio odit quod impedit sunt explicabo
              laudantium. Assumenda aspernatur pariatur. Perspiciatis dolorum impedit impedit
              explicabaaaaaao iste iusto ullam commodi fuga. Omnis iure minima eveniet ea fugiat.
              Reiciendis cupiditate rem natus non quo ut. Sint dolorum porro delectus omnis earum
              vitae perspiciatis consequatur occaecati. Nesciunt nesciunt inventore porro architecto
              neque aspernatur ullam delectus. Animi dolorem voluptatum nemo. Veniam ea sit
              architecto dicta. Suscipit repellat quidem omnis. Rerum quam rem repellendus non quia
              veniam numquam perferendis. Accusamus mollitia eos illo nam. Doloribus voluptatum amet
              architecto veniam nobis recusandae. Placeat minima sed vel aspernatur maxime ipsa hic
              veniam reiciendis. Adipisci impedit magni accusantium reprehenderit tempore hic sequi.
              Rem saepe eos ut nobis consequuntur dolore autem labore.
            </Text>
          </View>
        </EnhancePageView>
        <EnhancePageView style={{ flex: 1, backgroundColor: "white" }}>
          <View>
            <Text>
              deleniti expedita. Dolore odit ad consequatur quasi quas labore ipsum. Ipsam impedit
              harum quidem. Odio quas voluptatibus nihil. Aliquid eligendi dolorem tempora vel quae
              dolores deleniti optio suscipit. Quo ducimus nobis esse architecto. Vel dolorem fuga
              natus. Aperiam non non nostrum illum unde. Neque quam dolore molestias quidem culpa
              praesentium magni minus debitis. Ab molestiae ab accusantium optio quisquam. Rem
              accusantium veniam quasi rerum sit voluptatum commodi perspiciatis quas. Tempore neque
              ducimus porro debitis repellat porro nam fugiat iure. Quidem earum pariatur. Unde
              optio nisi alias hic distinctio quia magnam fuga. Aspernatur incidunt unde enim
              eligendi ipsum dolores voluptas atque. Quaerat earum saepe iure doloremque.
            </Text>
          </View>
        </EnhancePageView>
        <EnhancePageView style={{ flex: 1, backgroundColor: "white" }}>
          <View>
            <Text>
              Perferendis amet vitae dolore laborum. In veritatis odio iure. Fugiat facilis
              voluptatibus magni consectetur distinctio. Voluptate incidunt hic porro atque.
              Sapiente similique hic ratione dolorum quasi quasi. Quaerat esse sed quibusdam
              distinctio. Accusantium et consequatur enim quos vero tempore. Sed quia maxime quaerat
              eos tempore quod veniam. Id repellendus dolorem molestias facere earum. Odit eaque
              esse nostrum quod. Quo ad magnam adipisci. Dolores fugiat perferendis doloremque
              accusantium saepe eligendi alias doloribus suscipit. Praesentium similique repudiandae
              blanditiis reprehenderit dolorum quas.
            </Text>
          </View>
        </EnhancePageView>
      </EnhancePagerView>
    </View>
  )
}
